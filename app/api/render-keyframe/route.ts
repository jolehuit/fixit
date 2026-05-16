/**
 * POST /api/render-keyframe
 * Owner: Role C
 *
 * Wraps fal-ai/openai/gpt-image-2/edit. Accepts a reference photo + a
 * step prompt, returns a public Keyframe URL. Supports a previous keyframe
 * URL to preserve continuity for step > 1.
 *
 * Retry policy: one retry on failure; second failure → 502 fal_failed.
 * Quality-tier downshift (high → medium) on slow runs is enforced by the
 * orchestrator (Role D), not here — this route honors whatever quality
 * the caller passes.
 */

import { NextResponse } from 'next/server';
import { fal, FAL_IMAGE_EDIT_ENDPOINT } from '@/lib/fal';
import { Keyframe, RenderKeyframeRequest } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Translate our schema's `image_size` to the fal preset vocabulary.
 *
 * Our schema:   'square' | 'landscape_16_9' | 'portrait_9_16'
 * fal presets:  'square' | 'landscape_16_9' | 'portrait_16_9' (= 576x1024, vertical)
 *
 * The fal `portrait_16_9` preset is the vertical 9:16 format (576x1024),
 * so we remap our `portrait_9_16` to it.
 */
function toFalImageSize(size: 'square' | 'landscape_16_9' | 'portrait_9_16') {
  switch (size) {
    case 'portrait_9_16':
      return 'portrait_16_9';
    default:
      return size;
  }
}

type FalImageEditResult = {
  data: {
    images: Array<{ url: string; width?: number; height?: number; content_type?: string }>;
  };
  requestId?: string;
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = RenderKeyframeRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { step_number, kind, reference_url, prev_keyframe_url, prompt, quality, image_size } =
    parsed.data;

  // Multi-image reference: include prev keyframe when present for step continuity.
  const image_urls = prev_keyframe_url ? [reference_url, prev_keyframe_url] : [reference_url];

  const input = {
    prompt,
    image_urls,
    quality, // 'high' | 'medium' map 1:1 to fal's enum
    image_size: toFalImageSize(image_size),
  };

  async function callFal(): Promise<FalImageEditResult> {
    return (await fal.subscribe(FAL_IMAGE_EDIT_ENDPOINT, {
      input,
      logs: true,
    })) as FalImageEditResult;
  }

  let result: FalImageEditResult;
  try {
    result = await callFal();
  } catch (firstErr) {
    console.error('[render-keyframe] fal first attempt failed', firstErr);
    try {
      result = await callFal();
    } catch (secondErr) {
      console.error('[render-keyframe] fal retry failed', secondErr);
      return NextResponse.json(
        { error: 'fal_failed', detail: String(secondErr) },
        { status: 502 },
      );
    }
  }

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    console.error('[render-keyframe] fal returned no image url', result);
    return NextResponse.json(
      { error: 'fal_failed', detail: 'no_image_url_in_response' },
      { status: 502 },
    );
  }

  return NextResponse.json(Keyframe.parse({ step_number, kind, url }));
}
