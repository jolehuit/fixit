/**
 * POST /api/clarify
 * Owner: Role B
 *
 * Two modes:
 *  - No answers (or empty) → polish/complete the uncertainties from analyze
 *    via gpt-5.5 (text-only; vision context already lives in analyze.problem_visual).
 *  - Answers present → mark clarification resolved, no model call.
 *
 * Output language: English content in all `_fr` fields (legacy schema naming).
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { reasoningModel } from '@/lib/openai';
import { ClarifyOptions, ClarifyRequest } from '@/lib/types';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You polish clarification questions into UI-ready form for an end user. Your output drives the buttons / free-text inputs shown in the app, and the answers feed the parts-research stage.

Inputs you receive (in the user message):
- The structured object identification (a slotted string from upstream).
- The structured visible problem (a slotted string from upstream).
- The list of uncertainties produced by the upstream vision step. Each may already include a "(— used to …)" purpose clause.

For EACH uncertainty:
- Keep "field" UNCHANGED (downstream lookup key).
- Rewrite "question_fr" with this exact format:
    "<short direct English question> (— used to <one-line purpose>)"
  Examples:
    "Which exact iPhone model? (— used to pick the correct display assembly P/N)"
    "Trap diameter in mm? (— used to size the replacement slip washer and nut)"
  If a purpose clause is already present, keep / refine it; if missing, INFER it from the field name and the object/problem context and add it. The purpose clause is mandatory.
- "options": include 1–3 strings (≤3 words each) ONLY when ≤3 candidates are realistically enumerable from the input context. Otherwise OMIT the field entirely so the UI renders a free-text input. Do not invent options.
- The question must remain answerable in <5 seconds by a non-expert end user.

Polishing rules:
- No politeness ("Could you please…", "Would you mind…"): use direct questions.
- Avoid technical jargon if a plain phrasing exists. Keep precision in the purpose clause, not in the question itself.
- Keep questions ≤8 words (before the purpose clause).

Strict output:
- Return JSON matching the ClarifyOptions schema.
- All text content in ENGLISH (the legacy "_fr" field name is decoupled from content language).
- Same number of uncertainties as input. Do not add, do not drop, do not reorder unless reordering puts the most-blocking question first.`;

const userPrompt = (object: string, problemVisual: string, uncertaintiesJson: string): string =>
  `Object: ${object}
Visible problem: ${problemVisual}
Input uncertainties (JSON): ${uncertaintiesJson}

Polish each uncertainty per the system rules and return ClarifyOptions JSON.`;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = ClarifyRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Mode B: answers provided → resolved, no model call.
  if (parsed.data.answers && parsed.data.answers.length > 0) {
    return NextResponse.json({ resolved: true });
  }

  // Mode A: no answers. If analyze produced no uncertainties, short-circuit.
  const { analyze } = parsed.data;
  if (analyze.uncertainties.length === 0) {
    return NextResponse.json(ClarifyOptions.parse({ uncertainties: [] }));
  }

  try {
    requireEnv('OPENAI_API_KEY');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OPENAI_API_KEY missing';
    return NextResponse.json({ error: 'env_missing', message }, { status: 500 });
  }

  try {
    const result = await generateObject({
      model: reasoningModel(),
      schema: ClarifyOptions,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt(
            analyze.object,
            analyze.problem_visual,
            JSON.stringify(analyze.uncertainties),
          ),
        },
      ],
    });

    const safe = ClarifyOptions.parse(result.object);
    return NextResponse.json(safe);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'clarify failed';
    return NextResponse.json({ error: 'clarify_failed', message }, { status: 500 });
  }
}
