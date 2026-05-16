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

Your job: produce a COMPLETE RepairPlan JSON that another team will use to generate a video. Every field is mandatory. Steps must be ordered, 2 to 10 of them, each filmable in roughly 4–8 seconds.

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

Per-step OPTIONAL enrichments (fill when adding value — every step should have at least subtitle_fr and success_criteria_fr):
- "shot_type": e.g. "macro close-up", "medium shot, two hands", "top-down 45°".
- "camera_movement": e.g. "static", "slow push-in", "subtle parallax", consistent with the scene_lock.camera_default.
- "motion_pacing": "slow & deliberate" | "snappy" | "steady".
- "subject_focus_fr": ≤10 English words, what the viewer should look at this step.
- "subtitle_fr": ≤55 chars English caption to burn in. Active voice, no period at the end.
- "safety_note_fr": ≤20 English words. Only when there is a real risk (pinch, mains, gas, glass).
- "success_criteria_fr": ≤20 English words. How the user knows the step worked.
- "common_mistake_fr": ≤20 English words. The single most common mistake at this step.

Top-level:
- "problem_summary_fr": ≤15 words, English. Restate the defect with its location precisely.
- "difficulty": easy | medium | hard. Calibrate by the count and risk of disassembly + tool requirements.
- "total_duration_min": integer minutes, sum of step durations rounded up.

Top-level OPTIONAL enrichments (fill whenever you can — they make the UI richer):
- "estimated_cost_eur": { parts_low, parts_high } — integers in euros. Be honest about the spread (€2–€8 is fine for a patch kit).
- "safety_pre_check_fr": 1–4 short English bullets shown before step 1 (e.g. "Wear gloves", "Switch off mains").
- "parts_summary": consolidated unique parts across all steps. Each: { name, quantity, specification_fr }. specification_fr is the dimension / standard that matters for ordering (e.g. "26x1.95 inner tube, Schrader valve").
- "tools_summary": consolidated unique tools across all steps. Each: { name, required (true/false), specification_fr }. Mark "required: false" for nice-to-have items.
- "scene_lock": a SHARED visual continuity bundle used by EVERY step. Helps the video model keep the scene consistent across cuts.
    * subject: one short English phrase identifying the object as seen in the photo (use the input identification).
    * environment: where the action happens ("indoors, neutral floor", "kitchen sink, well lit").
    * hands_style: "bare adult hands, clean nails" by default; adjust if relevant.
    * style: "clean instructional documentary, soft natural light, real materials, no text overlay".
    * color_palette_fr: dominant colors of the subject in English (e.g. "white and blue frame, black tires, gravel floor").
    * shot_default: the default framing repeated across steps (e.g. "medium close-up, 35mm equivalent").
    * camera_default: default movement (usually "static" or "very slow push-in").
    * consistency_phrases: 2–5 short English phrases that MUST appear in every visual_prompt_start/end to lock identity (e.g. ["Decathlon Rockrider 26" mountain bike", "blue and white frame", "rear wheel on gravel"]).
    * negative_cues: 2–5 short English phrases to avoid (e.g. ["text overlay", "different bike model", "indoor studio backdrop"]).

Grounding rules:
- Prefer the research context for procedure, parts, and tools. Fall back on general repair knowledge only when context is thin.
- When the input gives a confirmed model/dimension, use it explicitly in titles, narration, and prompts.
- Do not invent specific torques, voltages, or part numbers not supported by the research context or general knowledge.
- Safety: if the research context warns about a step (battery, gas, mains), include the warning in narration_fr.

Strict output:
- JSON matches the RepairPlan schema. No extra fields.
- All text content in ENGLISH regardless of field name.`;

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
