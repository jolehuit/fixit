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

/**
 * Repair-procedure synthesis prompt.
 *
 * Calibrated for the downstream stack:
 *   - gpt-image-2/edit  → renders the start and end keyframes from the user photo
 *   - Seedance 2.0 fast → animates between the two keyframes (image-to-video)
 *
 * gpt-image-2 prompting guide (OpenAI cookbook) — applied to visual prompts:
 *   • "change only X" + "keep everything else the same"
 *   • State invariants explicitly (do not alter saturation, contrast, layout,
 *     camera angle, or surrounding objects)
 *   • Re-state critical identity on each iteration to reduce drift
 *
 * Seedance 2.0 prompt guide (ByteDance) — applied to motion prompts:
 *     [Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid [Constraints]
 *   For image-to-video with start AND end frames, Seedance already SEES both
 *   images — keep motion prompts short (≤20 words), focus on motion + ONE
 *   camera instruction + lighting hint. Camera vocabulary: push-in, pull-out,
 *   pan, tracking, orbit, aerial, handheld, fixed. Pacing words: "slow",
 *   "gentle", "smooth", "stable" — never "fast" alone.
 *
 * Image-pair continuity rule:
 *   start and end share the exact same composition, framing, distance, lens,
 *   lighting, and subject identity. Only the action state differs.
 */
const SYSTEM_PROMPT = `You are a repair-procedure synthesizer. You receive:
- A structured product identification string (slotted: Brand / Model / Markings / etc.).
- A structured visible-problem string (slotted: Defect / Location / Severity / Signs).
- Optional clarification answers from the user (model number, year, dimensions…).
- Raw research context: spec-sheet content (Stage 1) AND repair-guide content (Stage 2), concatenated with source URLs.

Your job: produce a COMPLETE RepairPlan JSON that another team will use to generate a video. Steps must be ordered, 5 to 7 of them, each filmable in roughly 4–8 seconds.

DOWNSTREAM PIPELINE — your visual / motion prompts feed two models:

  • visual_prompt_start / visual_prompt_end → gpt-image-2/edit, with the user's photo as reference.
    GOAL: two keyframes that look like the SAME continuous shot — only the action state differs.
    HARD RULES (from the OpenAI gpt-image cookbook):
      - Both prompts are ≤25 English words.
      - Use IDENTICAL framing language in start and end (same shot type, distance, angle, environment).
      - Re-state the exact subject identity in BOTH prompts (brand + model + finish + orientation, e.g. "iPhone 11 black, screen face up on cream lace tablecloth"). Drift happens when identity is dropped mid-pair.
      - State invariants explicitly: "preserve color and proportions, same camera angle, same lighting, no UI overlay, no text".
      - Mention hands naturally and the specific tool in frame (suction cup, opening pick, spudger, P2 pentalobe driver, Y000 driver, tweezers).
      - Describe the action's STATE, not the action itself (start: "suction cup attached, screen flat"; end: "screen lifted 5 mm at bottom, pick inserted at corner").
      - Never introduce a new object between start and end. Tools and hands present in start MUST also be in end (they may have moved).

  • motion_prompt → Seedance 2.0 fast image-to-video (start_image + end_image mode).
    GOAL: bridge the two keyframes with believable, controlled motion.
    HARD RULES (from the Seedance 2.0 prompt guide):
      - Seedance already SEES both images. Do NOT redescribe the subject, the hands, or the environment.
      - One sentence, ≤20 English words.
      - Lead with the action verb in present tense ("you press", "you slide", "you lift", "you pry", "you unscrew").
      - Include ONE camera instruction from: fixed, slow push-in, gentle pan, slow tilt up, handheld slight shake. Default to "fixed camera" for delicate work.
      - Add a pacing word: "slow & deliberate", "steady", "smooth" — never "fast".
      - End with a negative cue if useful: "no identity change, no extra objects, no glass shatter".

For EACH step (the schema fields below are REQUIRED on every step):
- "step_number": integer, starting at 1.
- "title_fr": ≤6 words, English (legacy field name, content English). Action-led ("Power off and tape", "Soften the adhesive", "Lift the display").
- "description_fr": 1–2 short English sentences. Mention the specific sub-component, screw size, or torque the step acts on.
- "parts_needed": list, each ≤3 words. Use the confirmed model where relevant ("iPhone 11 display", "Pentalobe P2 screws ×2"). Empty array if no parts.
- "tools_needed": list, each ≤3 words ("Suction cup", "Opening picks", "Y000 driver", "iOpener / heat gun"). Empty array if no tools.
- "duration_seconds": integer 30–600, realistic for one cinematic beat.
- "shot_type": one of "macro close-up", "medium shot, two hands", "top-down 45°", "side profile", "over-the-shoulder".
- "camera_movement": "fixed", "slow push-in", "gentle pan", "slow tilt up", or "handheld slight shake".
- "motion_pacing": "slow & deliberate" | "steady" | "smooth".
- "subject_focus_fr": ≤10 English words — what the viewer should look at this step ("the two pentalobe screws", "the suction cup pulling open the seal").
- "visual_prompt_start" / "visual_prompt_end" / "motion_prompt": per the rules above.
- "narration_fr": 50–80 English words, second-person ("you"). Domain-savvy precision (e.g. screw type and size, temperature, torque, alignment landmarks). Pace must match duration_seconds.
- "subtitle_fr": ≤55 chars English caption to burn in. Active voice, no period at the end.
- "safety_note_fr": ≤20 English words. Only when there is a real risk this step (battery short, glass shards, ESD, heat damage, biometrics loss).
- "success_criteria_fr": ≤20 English words — how the user knows the step worked.
- "common_mistake_fr": ≤20 English words — the single most common mistake at this step.

Top-level (these top-level fields are ALL required):
- "problem_summary_fr": ≤15 English words. Restate the defect with its precise location, using the confirmed model.
- "difficulty": easy | medium | hard.
- "total_duration_min": integer minutes, sum of step durations rounded up.
- "estimated_cost_eur": { "parts_low": integer, "parts_high": integer }. Honest spread (e.g. 25–45 € for an aftermarket iPhone 11 LCD assembly).
- "safety_pre_check_fr": 1–4 short English bullets shown before step 1 (e.g. ["Drain battery below 25 %", "Wear safety glasses", "Power the phone off completely"]).
- "parts_summary": consolidated unique parts across all steps. Each: { "name", "quantity", "specification_fr" }. specification_fr carries the dimension / standard that matters for ordering (e.g. "iPhone 11 OLED + digitizer assembly, A2111").
- "tools_summary": consolidated unique tools across all steps. Each: { "name", "required" (true/false), "specification_fr" }. Mark "required": false for nice-to-have items.
- "scene_lock": SHARED visual continuity bundle used by every step. Helps the video model keep the scene consistent across cuts.
    * "subject": one short English phrase identifying the object as seen in the photo (use the input identification).
    * "environment": where the action happens ("on a clean cream-lace tablecloth, indoors, natural daylight").
    * "hands_style": "bare adult hands, clean nails" by default; adjust if relevant.
    * "style": "clean instructional documentary, soft natural light, real materials, no text overlay".
    * "color_palette_fr": dominant colors in English (e.g. "black iPhone, black shattered glass, white lace tablecloth").
    * "shot_default": default framing repeated across steps (e.g. "macro close-up, 35 mm equivalent, top-down").
    * "camera_default": usually "fixed" for repair work.
    * "consistency_phrases": 2–5 short English phrases that MUST appear in every visual_prompt_start/end to lock identity (e.g. ["black iPhone 11", "front glass cracked", "lace tablecloth background"]).
    * "negative_cues": 2–5 short English phrases to avoid (e.g. ["text overlay", "different phone model", "studio backdrop", "glowing screen"]).

Grounding rules:
- Prefer the research context for procedure, parts, and tools. Fall back on general repair knowledge only when context is thin.
- When the input gives a confirmed model/dimension, use it explicitly in titles, narration, and prompts.
- Do not invent specific torques, voltages, or part numbers not supported by the research context or general knowledge.
- Safety: when this step carries a real risk (battery short, glass shards, ESD, heat damage, biometrics loss), surface it in BOTH narration_fr and safety_note_fr.

REFERENCE PROCEDURE — iPhone front-screen replacement.
This is the canonical 7-step skeleton when the photo shows a cracked iPhone front glass. Adapt the same rhythm (prep → open → internal access → swap → test → reseal → close) to other phone families, substituting the right screws / drivers from clarification answers.

  STEP 1 — Prep & remove bottom screws.
    Drain battery below 25 % (perforation = fire risk). Power off completely. Tape transparent packing tape over the cracked glass to contain shards; put safety glasses on. Remove the TWO 6.7 mm pentalobe P2 screws on either side of the Lightning port.
    Tools: P2 pentalobe driver, packing tape, safety glasses.

  STEP 2 — Soften the seal and create the first opening.
    Mark an opening pick at 3 mm from its tip (deeper cuts the internal flex cables). Heat the BOTTOM edge ~1 minute with an iOpener or hairdryer to soften the waterproof adhesive. Apply a suction cup (or Anti-Clamp) just above the bottom edge — NOT on the curved glass — and pull steady to open a sliver; slide the pick in.
    Tools: opening pick, iOpener / heat source, suction cup or Anti-Clamp.

  STEP 3 — Cut the perimeter adhesive.
    Slide the pick along the bottom-left, up the LEFT side, across the top staying superficial near the notch (Face ID lives there), then DOWN the right side carefully — the display flex cables run right under that edge. Never push past the 3 mm mark.
    Tools: opening picks.

  STEP 4 — Open like a book, disconnect the BATTERY first.
    Open the screen on the LEFT hinge like a book, propping it on a stand so the cables aren't tugged. Leave the bottom edge slightly raised. With a Y000 (tri-point) driver, remove the THREE 1.1 mm screws on the battery-connector cover, lift the cover, and disconnect the battery FPC IMMEDIATELY with a plastic spudger.
    Tools: Y000 driver, plastic spudger.

  STEP 5 — Disconnect the display ribbons and remove the old screen.
    Remove the FIVE 1.1 mm Y000 screws on the logic-board connector cover, lift the cover, then unplug in order: display, digitizer (touch), front-sensor (Face ID + earpiece). The old screen lifts free.
    Tools: Y000 driver, plastic spudger, ESD-safe tweezers.

  STEP 6 — Transfer the speaker + sensor assembly to the NEW screen.
    #1 PITFALL: this assembly is PAIRED to the phone — REPLACING it disables Face ID forever. You MUST transfer it. Remove three 1.6 mm Phillips and one 1.3 mm Y000 holding the cluster. Flip carefully (thin flex). Heat the top of the OLD screen 1–2 min to detach the mic, ambient-light sensor, and proximity + flood-illuminator (Face ID), prying each flex with a pick from its notch. Reseat onto the NEW screen.
    Tools: Phillips #000 driver, Y000 driver, opening picks, tweezers, heat source.

  STEP 7 — Reconnect, test, reseal, close.
    Reconnect the three ribbons in reverse (sensor → digitizer → display), then RECONNECT THE BATTERY LAST. Replace both connector covers + Y000 screws. Power on briefly to test: image, touch in all four corners, Face ID enrollment. If green, apply NEW waterproof adhesive around the perimeter (skipping it voids the IP rating). Close the screen, press the edges to set the adhesive, reinstall the two P2 pentalobe screws.
    Tools: Y000 driver, P2 pentalobe driver, replacement waterproof adhesive strip.

  Total: ~1–2 hours for a beginner. Difficulty: hard.
  Non-negotiables to spell out in narration_fr / safety_note_fr:
    (a) NEVER swap the speaker + sensor assembly to another chassis — Face ID dies for good.
    (b) ALWAYS reapply waterproof adhesive at close-up — otherwise the IP rating is gone.

Strict output:
- JSON matches the RepairPlan schema. No extra fields.
- All text content in ENGLISH regardless of field name (e.g. narration_fr field still gets English content).`;

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
