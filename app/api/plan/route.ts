/**
 * POST /api/plan
 * Owner: Role B
 *
 * Two-stage Tavily research + single GPT-5.5 synthesis pass.
 *
 *   Stage 1 — Model identification:
 *     Search using brand + visible markings + clarification answers.
 *     Target: spec sheets, official product pages, P/N catalogs.
 *     Goal: confirm exact compatible model/SKU and narrow which parts apply.
 *
 *   Stage 2 — Repair-guide research:
 *     Search using the (now-confirmed) model + defect type + defect location.
 *     Target: step-by-step repair manuals (iFixit, Instructables, manufacturer guides).
 *     Goal: extract the actual procedure to ground the LLM synthesis.
 *
 *   Extraction: top-3 results from each stage → 6 sources, deduped by URL,
 *   merged into one capped context.
 *
 *   Synthesis: GPT-5.5 generateObject(schema=RepairPlan) produces:
 *     - factual fields (titles, descriptions, parts, tools, durations)
 *     - generative fields Role C consumes (visual_prompt_start/end,
 *       motion_prompt, narration_fr) — ALL in English content.
 *
 * Output language: ENGLISH in every text field (legacy "_fr" suffixes
 * are kept by contract; content is decoupled from field name).
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { reasoningModel } from '@/lib/openai';
import { tavilyClient } from '@/lib/tavily';
import { PlanRequest, RepairPlan } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * High-signal EN DIY / repair / manufacturer-support domains. Local to Role B;
 * the shared FR_REPAIR_DOMAINS in lib/tavily.ts stays untouched.
 *
 * Stage 1 (model ID) prefers manufacturer + retailer catalogs.
 * Stage 2 (repair guide) prefers iFixit + community DIY content.
 * Both lists overlap intentionally — Tavily handles the filter.
 */
const MODEL_ID_DOMAINS = [
  'ifixit.com',
  'support.apple.com',
  'amazon.com',
  'homedepot.com',
  'lowes.com',
  'plumbingsupply.com',
  'mcmaster.com',
  'sheldonbrown.com',
  'decathlon.com',
];

const REPAIR_GUIDE_DOMAINS = [
  'ifixit.com',
  'instructables.com',
  'familyhandyman.com',
  'wikihow.com',
  'thespruce.com',
  'bicycling.com',
  'parktool.com',
  'sheldonbrown.com',
];

const MAX_CONTEXT_BYTES = 24000;

const SYSTEM_PROMPT = `You are a repair-procedure synthesizer. You receive:
- A structured product identification string (slotted: Brand / Model / Markings / etc.).
- A structured visible-problem string (slotted: Defect / Location / Severity / Signs).
- Optional clarification answers from the user (model number, year, dimensions…).
- Raw research context: spec-sheet content (Stage 1) AND repair-guide content (Stage 2), concatenated with source URLs.

Your job: produce a COMPLETE RepairPlan JSON that another team will use to generate a video. Every field is mandatory. Steps must be ordered, 2 to 7 of them, each filmable in roughly 4–8 seconds.

For EACH step:
- "title_fr": ≤6 words, English (legacy field name, content English).
- "description_fr": 1–2 short sentences, English. Mention the specific sub-component the step acts on.
- "parts_needed": list, each ≤3 words. Where the research context names a specific part (P/N, brand, dimension), use that. Empty array if no parts.
- "tools_needed": list, each ≤3 words. Empty array if no tools.
- "duration_seconds": integer 30–600, realistic.
- "visual_prompt_start" AND "visual_prompt_end" describe the SAME exact scene from the SAME camera angle, framing, distance, lens, and lighting. **The only thing that differs between start and end is the action's state** (hand position, tool position, sub-component before vs after).
    * Both ≤25 English words.
    * Mention the specific object (use brand/model from input), hand position, tools in frame, the sub-component acted upon.
    * Use identical framing language across the pair (e.g., both say "top-down view, close-up on the trap inlet" — not "top-down" for start and "side view" for end).
    * Never introduce/remove objects between start and end. Tools and hands present in start MUST also be in end (or simply have moved).
- "motion_prompt": ≤1 English sentence describing what physically changes (the action), in the present tense ("you turn", "you slide"). The downstream video model will be additionally told to keep the camera and scene fixed — your motion prompt only needs to describe the action itself, NOT the framing.
- "narration_fr": 50–80 words, English (legacy field name), second-person ("you"). Describe what the user does, with the precision the research context allows (e.g. mention specific torque, screw type, washer orientation). Pace must match duration_seconds.

Top-level:
- "problem_summary_fr": ≤15 words, English. Restate the defect with its location precisely.
- "difficulty": easy | medium | hard. Calibrate by the count and risk of disassembly + tool requirements.
- "total_duration_min": integer minutes, sum of step durations rounded up.

Grounding rules:
- Prefer the research context for procedure, parts, and tools. Fall back on general repair knowledge only when context is thin.
- When the input gives a confirmed model/dimension, use it explicitly in titles, narration, and prompts.
- Do not invent specific torques, voltages, or part numbers not supported by the research context or general knowledge.
- Safety: if the research context warns about a step (battery, gas, mains), include the warning in narration_fr.

Strict output:
- JSON matches the RepairPlan schema. No extra fields.
- All text content in ENGLISH regardless of field name.`;

/**
 * Bike-specific synthesis prompt.
 *
 * Tuned for the downstream stack:
 *   - gpt-image-2/edit  → renders the start and end keyframes from a reference photo
 *   - Seedance 2.0 fast → animates between the two keyframes (image-to-video)
 *
 * Seedance 2.0 official prompt formula (ByteDance):
 *     [Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid [Constraints]
 *     ~ 60–100 words for free text-to-video, but for image-to-video Seedance does NOT
 *     need the subject re-described — the start image already carries identity.
 *     For motion prompts we therefore stay short (≤25 words) and focus on motion +
 *     one camera instruction + lighting hint.
 *
 * Camera vocabulary Seedance 2.0 understands well:
 *   push-in, pull-out, pan, tracking, orbit, aerial, handheld, fixed.
 *   Use pacing words: "slow", "gentle", "smooth", "stable" — never "fast" alone.
 *
 * Image-pair continuity rule (for gpt-image-2):
 *   start and end MUST share the exact same composition, framing, distance,
 *   lens, lighting, identity. Only the action state differs.
 */
const BIKE_SYSTEM_PROMPT = `You are a repair-procedure synthesizer SPECIALISED in bicycles. You receive a structured product identification, a structured visible problem, optional clarification answers, and raw research context (spec sheets + repair guides).

Your job: produce a COMPLETE RepairPlan JSON for a bike repair video. Steps must be ordered, 2 to 7 of them, each filmable in 4–8 seconds.

DOWNSTREAM PIPELINE — your prompts feed two models, write them accordingly:

  • visual_prompt_start / visual_prompt_end → gpt-image-2/edit, with the original bike photo as reference.
    GOAL: render two keyframes that LOOK like the same continuous shot, where only the action state differs (hand position, tool position, tire on / off the rim, etc.).
    HARD RULES (the gpt-image-2 model drifts if any of these are violated):
      - Both prompts are ≤25 English words.
      - Use IDENTICAL framing language in start and end. If start says "close-up, top-down, rear wheel on gravel", end must say the same — only the action state varies.
      - Name the EXACT bike from the input (brand + model line + frame color, e.g. "Decathlon Rockrider 26\\" blue/white mountain bike").
      - Mention hands position, tools in frame, the sub-component acted upon.
      - Never introduce a new object between start and end. Tools or hands present in start MUST also be in end (they may have moved).
      - Mention the action's STATE (start: "tire bead seated on rim"; end: "tire bead lifted off rim by lever") rather than the action itself.

  • motion_prompt → Seedance 2.0 fast image-to-video (start_image + end_image mode).
    GOAL: bridge the two keyframes with believable mechanical motion.
    HARD RULES:
      - Seedance already SEES both images. Do NOT redescribe the bike, the hands, the environment, or what's in either keyframe.
      - One sentence, ≤20 English words.
      - Lead with the action verb in present tense ("you lift", "you slide", "you press").
      - Include ONE camera instruction from this list: fixed, slow push-in, gentle pan, slow tilt up, handheld slight shake. Default to "fixed camera" for mechanical close-ups.
      - Add a pacing word: "slow & deliberate", "steady", "smooth" — never "fast".
      - Add a lighting hint when relevant ("soft natural daylight").
      - End with a negative cue if helpful: "no identity change, no extra objects".

For EACH step:
- "title_fr": ≤6 words, English. Describe the action ("Remove the rear wheel", "Pry the tire bead").
- "description_fr": 1–2 short English sentences. Mention the specific sub-component.
- "parts_needed": list, each ≤3 words. Specific when possible ("26x1.95 inner tube", "Presta valve cap").
- "tools_needed": list, each ≤3 words ("Tire lever ×2", "Floor pump").
- "duration_seconds": integer 30–600, realistic.
- "visual_prompt_start" / "visual_prompt_end" / "motion_prompt": per the rules above.
- "narration_fr": 50–80 English words, second-person ("you"). Bike-savvy precision (e.g. "deflate fully", "seat the bead by hand all the way around", "inflate to 3 bar / 45 psi").

Top-level:
- "problem_summary_fr": ≤15 English words. Use the confirmed bike model and the precise defect location.
- "difficulty": easy | medium | hard. A flat tire is easy; a hub bearing swap is hard.
- "total_duration_min": integer minutes, sum of step durations rounded up.

Bike-domain grounding:
- ALWAYS use the confirmed tire size, valve type, and brake type from the clarification answers — they go into parts_needed, narration, and visual prompts.
- Default to common-sense tools when the research context is thin: tire levers (×2), patch kit OR spare tube, floor pump, 15mm wrench for axle nuts (if not quick-release), allen key set.
- Safety mentions: pinch flats from incorrect tube installation, over-inflation risk, brake-pad alignment after wheel removal — fold these into narration_fr only when relevant to the step.

Strict output:
- JSON matches the RepairPlan schema. No extra fields.
- All text content in ENGLISH regardless of field name (e.g. narration_fr field still gets English content).`;

/**
 * Choose the synthesis system prompt based on the identified object family.
 *
 * Today: bike-specialised prompt for any bicycle-class object, generic
 * prompt for everything else. Other devs plug their domain in here.
 */
function pickSystemPrompt(object: string, category: string): string {
  const o = object.toLowerCase();
  const isBike =
    category === 'vehicle' &&
    (o.includes('bike') ||
      o.includes('bicycle') ||
      o.includes('vélo') ||
      o.includes('velo') ||
      o.includes('rockrider') ||
      o.includes('mountain bike') ||
      o.includes('road bike'));
  if (isBike) return BIKE_SYSTEM_PROMPT;
  return SYSTEM_PROMPT;
}

function buildModelIdQuery(object: string, answersJson: string | null): string {
  const base = `Identify exact product model and compatible spare parts: ${object}`;
  if (answersJson) {
    return `${base}. User-confirmed specifications: ${answersJson}.`;
  }
  return base;
}

function buildRepairGuideQuery(
  object: string,
  problemVisual: string,
  answersJson: string | null,
): string {
  const base = `Step-by-step repair manual: ${problemVisual} on ${object}`;
  if (answersJson) {
    return `${base}. Specifications confirmed: ${answersJson}.`;
  }
  return base;
}

function buildLlmUserPrompt(
  object: string,
  problemVisual: string,
  category: string,
  answersJson: string | null,
  researchContext: string,
): string {
  return `--- Product identification (structured) ---
${object}

--- Visible problem (structured) ---
${problemVisual}

--- Category ---
${category}

--- User clarification answers ---
${answersJson ?? 'No clarification answers provided.'}

--- Research context (Stage 1 = model spec sheets, Stage 2 = repair guides) ---
${researchContext || '(no external research available — rely on general repair knowledge)'}
--- End research context ---

Produce the RepairPlan JSON per the system rules. Be specific. Use the confirmed model and the procedure from the research context wherever possible.`;
}

/** Run a Tavily search → extract pipeline; return merged rawContent or "". */
async function fetchResearch(
  query: string,
  domains: string[],
  maxSearchResults: number,
  maxExtractUrls: number,
): Promise<{ context: string; urls: string[] }> {
  try {
    const tvly = tavilyClient();
    const searchRes = await tvly.search(query, {
      searchDepth: 'advanced',
      maxResults: maxSearchResults,
      includeDomains: domains,
      includeRawContent: 'text',
    });

    const topUrls = (searchRes.results ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, maxExtractUrls)
      .map((r) => r.url);

    if (topUrls.length === 0) return { context: '', urls: [] };

    const extractRes = await tvly.extract(topUrls, { extractDepth: 'advanced' });
    const blocks = (extractRes.results ?? []).map(
      (r) => `# Source: ${r.url}\n${r.rawContent ?? ''}`,
    );
    return { context: blocks.join('\n\n'), urls: topUrls };
  } catch {
    return { context: '', urls: [] };
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PlanRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    requireEnv('OPENAI_API_KEY');
    requireEnv('TAVILY_API_KEY');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'env missing';
    return NextResponse.json({ error: 'env_missing', message }, { status: 500 });
  }

  const { analyze, answers } = parsed.data;
  const answersJson = answers && answers.length > 0 ? JSON.stringify(answers) : null;

  // Two-stage parallel Tavily fetch.
  const [stageModel, stageRepair] = await Promise.all([
    fetchResearch(buildModelIdQuery(analyze.object, answersJson), MODEL_ID_DOMAINS, 5, 3),
    fetchResearch(
      buildRepairGuideQuery(analyze.object, analyze.problem_visual, answersJson),
      REPAIR_GUIDE_DOMAINS,
      5,
      3,
    ),
  ]);

  // Merge contexts, dedupe by source URL, cap total bytes.
  const seenUrls = new Set<string>();
  const sections: string[] = [];

  if (stageModel.context) {
    sections.push(`=== STAGE 1: MODEL IDENTIFICATION ===\n${stageModel.context}`);
    for (const u of stageModel.urls) seenUrls.add(u);
  }
  if (stageRepair.context) {
    // Crude dedupe: if a Stage 2 URL already appeared in Stage 1, drop its block.
    const filtered = stageRepair.context
      .split('\n\n')
      .filter((block) => {
        const m = block.match(/^# Source: (\S+)/);
        if (!m) return true;
        if (seenUrls.has(m[1])) return false;
        seenUrls.add(m[1]);
        return true;
      })
      .join('\n\n');
    if (filtered.trim()) {
      sections.push(`=== STAGE 2: REPAIR GUIDES ===\n${filtered}`);
    }
  }

  const researchContext = sections.join('\n\n').slice(0, MAX_CONTEXT_BYTES);

  // Specialised prompt routing — pick the most relevant synthesis prompt
  // based on the identified object family. Other devs add their domain
  // specialisations here (phones, plumbing, …); fall back to the generic
  // prompt for everything not yet specialised.
  const systemPrompt = pickSystemPrompt(analyze.object, analyze.category);

  try {
    const result = await generateObject({
      model: reasoningModel(),
      schema: RepairPlan,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: buildLlmUserPrompt(
            analyze.object,
            analyze.problem_visual,
            analyze.category,
            answersJson,
            researchContext,
          ),
        },
      ],
    });

    const safe = RepairPlan.parse(result.object);
    return NextResponse.json(safe);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'plan failed';
    return NextResponse.json({ error: 'plan_failed', message }, { status: 500 });
  }
}
