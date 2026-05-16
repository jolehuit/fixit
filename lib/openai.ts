/**
 * OpenAI provider for AI SDK 5.
 *
 * Role B uses this for:
 *  - /api/analyze   (vision + reasoning)
 *  - /api/clarify   (decide if clarification is needed; produce options)
 *  - /api/plan      (post-processing of Tavily output if needed)
 *  - narration script generation per step (consumed by /api/narrate)
 *
 * Image gen (GPT Image 2) does NOT go through this module — it goes via
 * fal.ai because that's how we orchestrate it per the PRD. See lib/fal.ts.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { env } from './env';

/**
 * Note: the model id `gpt-5.5` is what the PRD calls out. If the OpenAI
 * model alias changes (e.g. `gpt-5.5-mini` for reasoning), swap it here
 * only. No model name should leak into individual routes.
 */
export const VISION_MODEL = 'gpt-5.5';
export const REASONING_MODEL = 'gpt-5.5';

export const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export const visionModel = () => openai(VISION_MODEL);
export const reasoningModel = () => openai(REASONING_MODEL);
