/**
 * POST /api/classify-photo
 * Owner: Role B
 *
 * Vue d'oeil rapide sur la photo pour décider : matche-t-elle un des 3 démos
 * cached ou non ? On ne fait pas tourner le full /api/analyze (~18s) — un
 * prompt minimaliste suffit (~1-3s).
 *
 * Si le résultat matche un démo configuré côté cache (env vars présentes),
 * /api/run skip le pipeline live et joue le replay SSE depuis lib/demo-cache.
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEnv } from '@/lib/env';
import { visionModel } from '@/lib/openai';

export const runtime = 'nodejs';

const Request = z.object({
  photo_url: z.string().url(),
});

const Result = z.object({
  match: z.enum(['flat-tire', 'cracked-screen', 'dripping-faucet', 'none']),
});

export type ClassifyResult = z.infer<typeof Result>;

const SYSTEM_PROMPT = `You see a photograph. Classify it into EXACTLY ONE of these four categories:

- "flat-tire"        : a bicycle wheel that is visibly flat / deflated (rim sitting on the ground, tire fully compressed)
- "cracked-screen"   : a smartphone with a visibly cracked or shattered front display
- "dripping-faucet"  : a leaking faucet OR an under-sink siphon/trap with visible water dripping
- "none"             : anything else (other appliances, furniture, animals, food, irrelevant scenes…)

Be conservative: only emit one of the first three if the visual cue is unambiguous in the photo. If in doubt, return "none". Output JSON strictly matching the schema.`;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Request.safeParse(json);
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

  try {
    const result = await generateObject({
      model: visionModel(),
      schema: Result,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: parsed.data.photo_url },
            {
              type: 'text',
              text: 'Classify the attached photo per the system rules. Return strict JSON.',
            },
          ],
        },
      ],
    });
    return NextResponse.json(Result.parse(result.object));
  } catch (err: unknown) {
    // Classifier failure is non-fatal — let /api/run treat the result as "none"
    // and fall through to the live pipeline.
    const message = err instanceof Error ? err.message : 'classify failed';
    return NextResponse.json({ match: 'none', _warn: message } as ClassifyResult, { status: 200 });
  }
}
