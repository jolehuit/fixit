/**
 * POST /api/animate-step
 * Owner: Role C
 *
 * Wraps fal-ai/bytedance/seedance/v1/pro/fast/image-to-video.
 * Start frame + end frame + motion prompt → AnimatedClip (mp4 URL).
 *
 * TODO(Role C):
 *  - Plug fal.subscribe with FAL_VIDEO_I2V_ENDPOINT (lib/fal.ts).
 *  - Pass start image as `image_url` and end image as `end_image_url`.
 *  - Set `generate_audio: true` per the PRD if your run is using Seedance audio.
 *  - On failure, fall back to ffmpeg crossfade + Ken Burns (call /api/stitch with
 *    just the two stills + a generated motion file).
 */

import { NextResponse } from 'next/server';
import { mockAnimatedClip } from '@/lib/mocks';
import { AnimatedClip, AnimateStepRequest } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = AnimateStepRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring fal) ---
  const result = AnimatedClip.parse(mockAnimatedClip(1));
  return NextResponse.json(result);
}
