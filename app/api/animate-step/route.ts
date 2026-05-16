/**
 * POST /api/animate-step
 * Owner: Role C
 *
 * Wraps fal-ai/bytedance/seedance-2.0/fast/image-to-video.
 * Start frame + end frame + motion prompt → AnimatedClip (mp4 URL).
 *
 * On failure (after one retry) returns a 502 with { error: 'fal_failed' }.
 * The orchestrator (Role D) decides whether to invoke the Ken Burns fallback
 * (PRD §7) — TODO: ffmpeg crossfade + Ken Burns fallback is owned by the
 * stitch path, NOT this route.
 */

import { NextResponse } from 'next/server';
import { fal, FAL_VIDEO_I2V_ENDPOINT } from '@/lib/fal';
import { AnimatedClip, AnimateStepRequest } from '@/lib/types';

export const runtime = 'nodejs';

type SeedanceInput = {
  prompt: string;
  image_url: string;
  end_image_url?: string;
  resolution: '480p' | '720p';
  duration: string;
  aspect_ratio: 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  generate_audio: boolean;
};

type SeedanceOutput = {
  video?: { url?: string };
  seed?: number;
};

async function callSeedance(input: SeedanceInput) {
  return fal.subscribe(FAL_VIDEO_I2V_ENDPOINT, {
    input,
    logs: true,
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = AnimateStepRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    step_number,
    start_frame_url,
    end_frame_url,
    motion_prompt,
    duration_seconds,
    resolution,
  } = parsed.data;

  const input: SeedanceInput = {
    prompt: motion_prompt,
    image_url: start_frame_url,
    end_image_url: end_frame_url,
    resolution,
    // Seedance expects duration as a string.
    duration: String(duration_seconds),
    // Fixit pipeline always produces landscape clips per PRD §5.1.
    aspect_ratio: '16:9',
    generate_audio: true,
  };

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callSeedance(input);
      const data = result?.data as SeedanceOutput | undefined;
      const video_url = data?.video?.url;

      if (!video_url) {
        throw new Error(
          `Seedance returned no video URL (data=${JSON.stringify(data)})`,
        );
      }

      // The request value is what we contracted for. Seedance honors the
      // requested duration but occasionally rounds — warn if we ever observe
      // an explicit mismatch in future iterations.
      return NextResponse.json(
        AnimatedClip.parse({
          step_number,
          url: video_url,
          duration_seconds,
        }),
      );
    } catch (err) {
      lastErr = err;
      console.error(
        `[animate-step] step ${step_number} attempt ${attempt} failed:`,
        err,
      );
      // Retry once; bail on the second exception.
      if (attempt === 1) continue;
    }
  }

  // TODO(Role D): the orchestrator may now invoke the Ken Burns fallback
  // (see PRD §7) by passing the two stills + a generated motion file directly
  // to /api/stitch. We do NOT implement that fallback here.
  return NextResponse.json(
    { error: 'fal_failed', step_number, detail: String(lastErr) },
    { status: 502 },
  );
}
