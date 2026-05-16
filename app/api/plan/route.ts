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

Your job: produce a COMPLETE RepairPlan JSON that another team will use to generate a video. Every field is mandatory unless marked OPTIONAL. Steps must be ordered, 2 to 10 of them, each filmable in roughly 4–8 seconds.

═════ TOP-LEVEL FIELDS ═════

- "problem_summary_fr": ≤15 words English, restates defect + precise location.
- "difficulty": easy | medium | hard.
- "total_duration_min": integer, ceil(sum(duration_seconds) / 60).
- "estimated_cost_eur" (OPTIONAL): { parts_low, parts_high } in €, pieces only (no labour).
- "safety_pre_check_fr" (OPTIONAL, recommended): 0–4 GLOBAL warnings BEFORE starting (e.g. "Power off and unplug", "Shut off water under the sink", "Wear safety glasses").
- "parts_summary" (OPTIONAL, recommended): consolidated list across all steps. Each entry: { name, quantity, specification_fr? } where specification_fr ≤10 words (e.g. "matching ETRTO size, Presta valve").
- "tools_summary" (OPTIONAL, recommended): consolidated list. Each entry: { name, required, specification_fr? }. required:false for nice-to-have tools (heat gun, magnetic mat).

═════ scene_lock (OPTIONAL but STRONGLY recommended) ═════

Single object constraining EVERY step's visual generation. Same wording across keyframes = consistent video. Fields:
- "subject": ≤30 words English. The unchanging description of the object as it appears in the reference photo, repeated verbatim in every keyframe prompt. Example: "Apple iPhone 11 Pro, midnight green back, screen cracked across lower half, lying face-up".
- "environment": ≤20 words. Decor + light source (e.g. "clean grey workbench, soft natural daylight from upper-left, anti-static mat").
- "hands_style": ≤20 words (e.g. "one or two adult hands, light skin tone, no rings or watches, plain dark sleeves").
- "style": ≤20 words (e.g. "tutorial macro photography, shallow depth of field, photorealistic, 16:9 landscape").
- "color_palette_fr": ≤15 words English describing the palette to preserve.
- "shot_default": "wide" | "medium" | "close-up" | "macro" (recommended baseline: "macro" for repair tutorials).
- "camera_default": "static" | "subtle_pan_left" | "subtle_pan_right" | "subtle_zoom_in" | "subtle_zoom_out" (recommended: "static" — motion comes from hands, not camera).
- "consistency_phrases": 4–8 English phrases injected verbatim into every keyframe prompt. Pull from this proven list (Seedance + GPT Image 2 best practices):
    "same [object] as the reference photo"
    "preserve composition and colors"
    "no variation in appearance"
    "consistent design"
    "match the reference exactly"
    "same lighting and color palette"
- "negative_cues": 6–15 items injected into negative_prompt of both image and video models. Pull from:
    "no faces visible"
    "no text overlays"
    "no logos"
    "no animals"
    "no people walking"
    "no camera zoom"
    "no camera pan"
    "no scene change"
    "no cut"
    "no extra hands"
    "no extra fingers"
    "no morphing object"
    "no disappearing tool"
    "no background change"
    "no watermark"

═════ PER-STEP FIELDS ═════

REQUIRED:
- "step_number": int, sequential from 1.
- "title_fr": ≤6 words English.
- "description_fr": 1–2 short sentences English. Mention the specific sub-component this step acts on.
- "parts_needed": list, each ≤3 words. Empty array if none.
- "tools_needed": list, each ≤3 words. Empty array if none.
- "duration_seconds": int 30–600, realistic.
- "visual_prompt_start" AND "visual_prompt_end": both ≤25 English words. Describe the SAME exact scene (same camera, framing, distance, lens, lighting). The ONLY difference is the action's state (hand position, tool position, sub-component before vs after). Use identical framing language across the pair. Never introduce/remove objects between start and end.
- "motion_prompt": ≤1 English sentence, action in present tense ("you turn", "you slide"). The downstream video model is told separately to keep the camera and scene fixed.
- "narration_fr": 50–80 words English, second-person ("you"), pace matches duration_seconds.

OPTIONAL but RECOMMENDED:
- "shot_type": override of scene_lock.shot_default. Keep the SAME on 80%+ of steps for visual continuity.
- "camera_movement": override of scene_lock.camera_default. Quasi-always "static" for repair tutorials.
- "motion_pacing": "slow_methodical" | "controlled" | "deliberate". Controls how gentle the Seedance interpolation should feel.
- "subject_focus_fr": ≤10 words English naming the visual anchor of this step (e.g. "the lower-left pentalobe screw beside the Lightning port"). Fed verbatim to GPT Image 2 to keep keyframes focused.
- "subtitle_fr": ≤8 words English, 1-line burned-in subtitle, short version of narration.
- "safety_note_fr": ≤15 words English, specific danger for THIS step (e.g. "Battery short-circuit risk — disconnect first").
- "success_criteria_fr": ≤20 words English, how the user verifies the step worked (e.g. "Pipe end clean, washer compresses evenly when re-tightened").
- "common_mistake_fr": ≤20 words English (e.g. "Pressing the driver at an angle strips the pentalobe head").

═════ GROUNDING ═════

- Prefer the research context for procedure, parts, tools, torques.
- Use confirmed model/dimension from clarification answers explicitly in titles, narration, and visual prompts.
- Do not invent torques, voltages, or part numbers not supported by context or general repair knowledge.
- Safety: if the research context warns about a step (battery, gas, mains), include the warning in narration_fr AND in safety_note_fr.

═════ STRICT OUTPUT ═════

- JSON matches the RepairPlan schema. No extra top-level fields.
- All text content in ENGLISH regardless of legacy "_fr" field naming.`;

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

  try {
    const result = await generateObject({
      model: reasoningModel(),
      schema: RepairPlan,
      system: SYSTEM_PROMPT,
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
