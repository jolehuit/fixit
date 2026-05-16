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
import { FAL_VIDEO_I2V_ENDPOINT, fal } from '@/lib/fal';
import { AnimatedClip, AnimateStepRequest } from '@/lib/types';

export const runtime = 'nodejs';

type SeedanceInput = {
  prompt: string;
  negative_prompt?: string;
  image_url: string;
  end_image_url?: string;
  resolution: '480p' | '720p';
  duration: string;
  aspect_ratio: 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  generate_audio: boolean;
};

/**
 * Stability wrapper applied to every motion_prompt. The two keyframes already
 * lock the start and end states; this wrapper constrains Seedance to stay in
 * the same scene/camera/POV between them instead of inventing new content.
 *
 * Empirically observed Seedance failure modes we want to suppress:
 *   - camera pans / zooms unrelated to the action
 *   - extra hands materializing
 *   - tools / objects appearing or disappearing mid-clip
 *   - the subject morphing into a different object
 *   - background changing (workshop → kitchen, etc.)
 *
 * Reference: Seedance 2.0 image-to-video best practices —
 * "preserve composition and colors", minimal motion prompt, no camera moves.
 */
const PACING_HINTS: Record<'slow_methodical' | 'controlled' | 'deliberate', string> = {
  slow_methodical: 'Movements are slow, methodical, and unhurried.',
  controlled: 'Movements are controlled and steady.',
  deliberate: 'Movements are deliberate but confident.',
};

function buildSceneWrapper(
  motion: string,
  motionPacing?: 'slow_methodical' | 'controlled' | 'deliberate',
  cameraMovement?:
    | 'static'
    | 'subtle_pan_left'
    | 'subtle_pan_right'
    | 'subtle_zoom_in'
    | 'subtle_zoom_out',
): string {
  const cameraDirective =
    !cameraMovement || cameraMovement === 'static'
      ? 'Camera fixed in place — no pan, no zoom, no cuts, no scene change.'
      : `Camera applies only a ${cameraMovement.replace(/_/g, ' ')} — no other movement, no cuts, no scene change.`;

  const lines = [
    cameraDirective,
    'Same scene, same framing, same lighting from start to end. Preserve composition and colors of the reference frame.',
    'The only thing that moves is the action described next.',
    `Action: ${motion}`,
    'The object being repaired, the hands, and the tools remain consistent with the first frame — never multiply, morph, or disappear.',
  ];
  if (motionPacing) lines.push(PACING_HINTS[motionPacing]);
  return lines.join(' ');
}

const BASE_NEGATIVE_CUES = [
  'camera pan',
  'camera zoom',
  'camera shake',
  'scene change',
  'cut',
  'transition',
  'extra hands',
  'extra fingers',
  'duplicated tools',
  'morphing object',
  'disappearing tool',
  'new object appearing',
  'background change',
  'text overlay',
  'subtitles',
  'watermark',
  'blurry',
  'low quality',
  'distorted',
];

function buildNegativePrompt(extraCues: readonly string[] | undefined): string {
  const merged = new Set<string>(BASE_NEGATIVE_CUES);
  if (extraCues) for (const cue of extraCues) merged.add(cue);
  return Array.from(merged).join(', ');
}

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
    negative_cues,
    motion_pacing,
    camera_movement,
  } = parsed.data;

  const input: SeedanceInput = {
    prompt: buildSceneWrapper(motion_prompt, motion_pacing, camera_movement),
    negative_prompt: buildNegativePrompt(negative_cues),
    image_url: start_frame_url,
    end_image_url: end_frame_url,
    resolution,
    // Seedance expects duration as a string.
    duration: String(duration_seconds),
    // Fixit pipeline always produces landscape clips per PRD §5.1.
    aspect_ratio: '16:9',
    // Audio is provided by Gradium TTS (per-step narration) and muxed via
    // ffmpeg in /api/stitch. Seedance audio would double-up with the narration.
    generate_audio: false,
  };

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callSeedance(input);
      const data = result?.data as SeedanceOutput | undefined;
      const video_url = data?.video?.url;

      if (!video_url) {
        throw new Error(`Seedance returned no video URL (data=${JSON.stringify(data)})`);
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
      console.error(`[animate-step] step ${step_number} attempt ${attempt} failed:`, err);
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
