/**
 * POST /api/clarify
 * Owner: Role B
 *
 * Two modes:
 *  - No answers in body → generate 1–3 visual options for each uncertainty.
 *  - Answers in body → mark clarification resolved, return { resolved: true }.
 *
 * TODO(Role B):
 *  - When generating options, call gpt-5.5 vision so the options can include
 *    short visual descriptors or example image URLs the UI can show.
 *  - Keep options ≤ 3 per uncertainty; offer a free-text fallback.
 */

import { NextResponse } from 'next/server';
import { ClarifyOptions, ClarifyRequest } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = ClarifyRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.answers && parsed.data.answers.length > 0) {
    return NextResponse.json({ resolved: true });
  }

  // --- MOCK (delete when wiring the real model) ---
  const options = ClarifyOptions.parse({
    uncertainties: parsed.data.analyze.uncertainties,
  });
  return NextResponse.json(options);
}
