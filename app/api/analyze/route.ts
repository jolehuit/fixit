/**
 * POST /api/analyze
 * Owner: Role B
 *
 * Vision + reasoning. Takes a photo URL + optional voice transcript,
 * returns an AnalyzeResult (object, category, problem, uncertainties).
 *
 * TODO(Role B):
 *  - Call gpt-5.5 via Responses API with detail:"auto" on the image.
 *  - Decide which uncertainties (model, version, brand) warrant a clarification.
 *  - Return AnalyzeResult shape strictly — schema is enforced below.
 */

import { NextResponse } from 'next/server';
import { mockAnalyzeResult } from '@/lib/mocks';
import { AnalyzeRequest, AnalyzeResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = AnalyzeRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring the real model) ---
  const result = AnalyzeResult.parse(mockAnalyzeResult());
  return NextResponse.json(result);
}
