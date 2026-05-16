/**
 * POST /api/narrate
 * Owner: Role C
 *
 * Calls Gradium TTS REST with the FR flagship voice. The raw audio bytes
 * are uploaded to Vercel Blob and the public URL is returned in NarrationAudio.
 *
 * TODO(Role C):
 *  - Use `synthesize()` from lib/gradium.ts → Buffer.
 *  - Upload via lib/blob.ts → URL.
 *  - Tune voice settings (temperature, padding_bonus) once the FR voice is picked.
 *  - Run TTS in parallel with Seedance, not in series, to keep total < 90s.
 */

import { NextResponse } from 'next/server';
import { mockNarrationAudio } from '@/lib/mocks';
import { NarrateRequest, NarrationAudio } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = NarrateRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring Gradium + Blob) ---
  const result = NarrationAudio.parse(mockNarrationAudio(1));
  return NextResponse.json(result);
}
