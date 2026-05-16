/**
 * POST /api/analyze
 * Owner: Role B
 *
 * Vision + reasoning. Takes a photo URL + optional voice transcript,
 * returns an AnalyzeResult (object, category, problem, uncertainties).
 *
 * Pipeline:
 *  1. Validate input via AnalyzeRequest (Zod).
 *  2. Call gpt-5.5 via AI SDK 5 `generateObject` with the AnalyzeResult schema.
 *     Image input accepts either a public URL or a base64 data URL.
 *  3. Double-validate the model output before returning so the contract in
 *     lib/types.ts is never violated downstream (Role C / Role D).
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { visionModel } from '@/lib/openai';
import { AnalyzeRequest, AnalyzeResult } from '@/lib/types';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a repair-diagnosis assistant. The user shows you a photo of a broken or malfunctioning object and (sometimes) describes the problem out loud, possibly in French.

Your job:
1. Identify the object as precisely as the photo allows — brand, model, variant when visible.
2. Describe the visible problem in ONE short English sentence.
3. List up to 3 *visual* uncertainties: things you can't tell from the photo that would change the repair procedure (e.g. exact model when multiple plausible candidates are visible, severity of damage hidden by the angle). Do NOT invent uncertainties to appear cautious — only return uncertainties that genuinely block a sound repair plan.
4. For each uncertainty, propose up to 3 short options (≤3 words each) the user can pick visually. Phrase each question as a direct English question ("Which model?", not "Could you please specify…").
5. Categorize the object as one of: vehicle, electronics, plumbing, furniture, other.

Output rules:
- All text fields in ENGLISH, including the fields whose schema names end in "_fr" (legacy naming — content must be English).
- If no blocking uncertainty: return an empty array.`;

const userPrompt = (transcript: string | undefined): string => {
  const t = transcript?.trim();
  if (t) {
    return `User's voice description (may be in French): "${t}"\n\nAnalyze the photo and return AnalyzeResult JSON matching the schema, with all text content in English.`;
  }
  return `No voice description provided.\n\nAnalyze the photo and return AnalyzeResult JSON matching the schema, with all text content in English.`;
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = AnalyzeRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    requireEnv('OPENAI_API_KEY');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OPENAI_API_KEY missing';
    return NextResponse.json({ error: 'env_missing', message }, { status: 500 });
  }

  const { photo_url, transcript_fr } = parsed.data;

  try {
    const result = await generateObject({
      model: visionModel(),
      schema: AnalyzeResult,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image', image: photo_url },
            { type: 'text', text: userPrompt(transcript_fr) },
          ],
        },
      ],
    });

    const safe = AnalyzeResult.parse(result.object);
    return NextResponse.json(safe);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'analyze failed';
    return NextResponse.json({ error: 'analyze_failed', message }, { status: 500 });
  }
}
