/**
 * POST /api/stitch
 * Owner: Role C
 *
 * ffmpeg concat: per-step video + narration audio + burned-in FR subtitles.
 * Uploads the final file to Vercel Blob and returns FinalVideo.
 *
 * Critical Vercel config (already in vercel.json):
 *   - memory: 3009
 *   - maxDuration: 800
 *
 * Critical Next.js config (already in next.config.ts):
 *   - outputFileTracingIncludes pins the ffmpeg-static binary into the bundle.
 *
 * TODO(Role C):
 *  - ffmpeg-static + child_process.spawn — see vercel-labs/ffmpeg-on-vercel.
 *  - Build a .srt or .ass file with FR subtitles from each clip.subtitle_fr,
 *    burn them in via the `-vf subtitles=...` filter.
 *  - Upload result via lib/blob.ts.
 */

import { NextResponse } from 'next/server';
import { mockFinalVideo } from '@/lib/mocks';
import { FinalVideo, StitchRequest } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = StitchRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring ffmpeg + Blob) ---
  const result = FinalVideo.parse(mockFinalVideo());
  return NextResponse.json(result);
}
