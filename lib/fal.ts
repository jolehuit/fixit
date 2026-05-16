/**
 * fal.ai client wrapper.
 *
 * Role C uses this for:
 *  - /api/render-keyframe → openai/gpt-image-2/edit
 *  - /api/animate-step    → bytedance/seedance-2.0/fast/image-to-video
 *
 * Keep the model IDs centralized here so swaps stay one-file.
 */

import { fal } from '@fal-ai/client';
import { env } from './env';

// Idempotent: subsequent calls are no-ops.
if (env.FAL_KEY) {
  fal.config({ credentials: env.FAL_KEY });
}

/** Endpoint IDs (single source of truth — swap here, nowhere else). */
export const FAL_IMAGE_EDIT_ENDPOINT = 'openai/gpt-image-2/edit';
export const FAL_VIDEO_I2V_ENDPOINT = 'bytedance/seedance-2.0/fast/image-to-video';

export { fal };
