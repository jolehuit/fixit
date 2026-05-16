/**
 * POST /api/plan
 * Owner: Role B
 *
 * Pipeline:
 *  1. Tavily /search on an EN repair query, restricted to high-signal EN DIY
 *     domains (ifixit, instructables, family handyman, wikihow, thespruce).
 *  2. Tavily /extract on the top 3 results → raw markdown context.
 *  3. GPT-5.5 generateObject with RepairPlan schema. ONE pass fills both the
 *     factual fields (titles, descriptions, parts, tools, durations) AND the
 *     generative fields (visual_prompt_start/end, motion_prompt, narration_fr)
 *     that Role C depends on.
 *
 * Output language: ENGLISH content in every text field, including the legacy
 * `_fr`-suffixed keys (schema names frozen, content language decoupled).
 *
 * Failure modes:
 *  - Tavily search returns 0 results → fall through with empty context; the
 *    LLM still produces a plan from analyze.object + problem_visual alone.
 *  - Tavily extract partial-fails → use only the successful extracts.
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { reasoningModel } from '@/lib/openai';
import { tavilyClient } from '@/lib/tavily';
import { PlanRequest, RepairPlan } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * High-signal EN DIY/repair domains. Local to Role B; the project-level
 * FR_REPAIR_DOMAINS in lib/tavily.ts stays untouched (other roles may use it).
 */
const EN_REPAIR_DOMAINS = [
  'ifixit.com',
  'instructables.com',
  'familyhandyman.com',
  'wikihow.com',
  'thespruce.com',
  'bicycling.com',
];

const SYSTEM_PROMPT = `You are a repair-procedure synthesizer. You receive:
- Object identification + visible problem (from a vision step).
- Optional clarification answers from the user.
- Raw research context scraped from EN DIY sources.

Produce a complete RepairPlan JSON. EVERY field must be populated. Steps must be ordered, 2 to 8 of them, each independently filmable in roughly 4 to 8 seconds.

Per step:
- "title_fr": ≤6 words, English (legacy field name, content is English).
- "description_fr": 1–2 short sentences, English.
- "parts_needed": list, each ≤3 words. Empty array if no parts.
- "tools_needed": list, each ≤3 words. Empty array if no tools.
- "duration_seconds": realistic, 30 to 600 seconds, integer.
- "visual_prompt_start": short ENGLISH scene description for an image generator. Mention the object, hand position, tools in frame, the state BEFORE the action. ≤25 words.
- "visual_prompt_end": same, for the state AFTER the action. ≤25 words.
- "motion_prompt": ≤1 ENGLISH sentence describing what changes between start and end (the action itself).
- "narration_fr": 50–80 words, ENGLISH (legacy field name), second-person ("you"), describes what the user is doing in this step, narration-style. Pace must roughly match duration_seconds.

Top level:
- "problem_summary_fr": ≤15 words, English. The problem in one user-readable sentence.
- "difficulty": easy | medium | hard.
- "total_duration_min": integer minutes, sum of step durations rounded up.

Rules:
- All text content in ENGLISH regardless of field name.
- Do not invent parts/tools not implied by the research context or general repair knowledge.
- If the research context is thin, lean on general repair knowledge for the procedure but stay safe (no electrical/gas work shortcuts).
- Output strict JSON matching the schema. No extra fields.`;

function buildSearchQuery(
  object: string,
  problemVisual: string,
  answersJson: string | null,
): string {
  const base = `How to repair: ${problemVisual} on ${object}.`;
  if (answersJson) {
    return `${base} Context from user clarification: ${answersJson}.`;
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
  return `Object: ${object}
Category: ${category}
Visible problem: ${problemVisual}
${answersJson ? `User clarification answers (JSON): ${answersJson}` : 'No clarification answers.'}

--- Research context (raw, may be partial) ---
${researchContext || '(no external research available — rely on general repair knowledge)'}
--- End research context ---

Produce the RepairPlan JSON per the system rules.`;
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

  let researchContext = '';
  try {
    const tvly = tavilyClient();
    const searchQuery = buildSearchQuery(analyze.object, analyze.problem_visual, answersJson);
    const searchRes = await tvly.search(searchQuery, {
      searchDepth: 'advanced',
      maxResults: 5,
      includeDomains: EN_REPAIR_DOMAINS,
      includeRawContent: 'text',
    });

    const topUrls = (searchRes.results ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => r.url);

    if (topUrls.length > 0) {
      const extractRes = await tvly.extract(topUrls, { extractDepth: 'basic' });
      researchContext = (extractRes.results ?? [])
        .map((r) => `# ${r.url}\n${r.rawContent}`)
        .join('\n\n')
        .slice(0, 18000);
    }
  } catch (_err) {
    // Tavily failure is non-fatal — fall through to LLM-only generation.
    researchContext = '';
  }

  try {
    const result = await generateObject({
      model: reasoningModel(),
      schema: RepairPlan,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
