/**
 * POST /api/render-keyframe
 * Owner: Role C
 *
 * Wraps fal-ai/openai/gpt-image-2/edit. Accepts a reference photo + a
 * step prompt, returns a public Keyframe URL. Supports a previous keyframe
 * URL to preserve continuity for step > 1.
 *
 * TODO(Role C):
 *  - Plug fal.subscribe with FAL_IMAGE_EDIT_ENDPOINT (lib/fal.ts).
 *  - Retry once on failure; if `quality:"high"` exceeds 25s on the first call,
 *    downshift the whole run to `quality:"medium"` and emit an `info` event.
 *  - Surface fal queue updates so the orchestrator can stream sub-progress.
 */

import { NextResponse } from 'next/server';
import { mockKeyframe } from '@/lib/mocks';
import { Keyframe, RenderKeyframeRequest } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = RenderKeyframeRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring fal) ---
  const result = Keyframe.parse(mockKeyframe(1, 'start'));
  return NextResponse.json(result);
}
