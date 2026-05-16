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

const SYSTEM_PROMPT = `You polish UI-ready clarification questions for an end user.

Input: an object identification, a visual problem description, and a list of uncertainties detected by an upstream vision model.

For each uncertainty:
- Rewrite "question_fr" as a short, direct English question — no politeness, no "Could you please…". Examples: "Which model?", "Type of screw?".
- Provide 1 to 3 "options", each ≤3 words, English. Do not invent options if no signal supports them — omit the field instead.
- Keep "field" unchanged.

Strict output:
- Return JSON matching the ClarifyOptions schema.
- All text content in ENGLISH (the field name "question_fr" is legacy — its content must be English).
- Do not add uncertainties that the input did not contain. Do not drop input uncertainties.`;

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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
