/**
 * Shared Zod contracts. Every role reads from here.
 *
 * Rules:
 *  - Adding a field: safe.
 *  - Removing or renaming a field: coordinate with all 4 roles first.
 *  - The frontend (Role A), Role B (analyze/clarify/plan), Role C (render/animate/narrate/stitch)
 *    and Role D (run/stream/cache) all rely on this file as the single source of truth.
 */

import { z } from 'zod';

// ---------- Categories & primitives ----------

export const RepairCategory = z.enum(['vehicle', 'electronics', 'plumbing', 'furniture', 'other']);
export type RepairCategory = z.infer<typeof RepairCategory>;

export const Difficulty = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof Difficulty>;

export const Quality = z.enum(['high', 'medium']);
export type Quality = z.infer<typeof Quality>;

export const KeyframeKind = z.enum(['start', 'end']);
export type KeyframeKind = z.infer<typeof KeyframeKind>;

export const DemoId = z.enum(['flat-tire', 'cracked-screen', 'dripping-faucet']);
export type DemoId = z.infer<typeof DemoId>;

// ---------- Vision analysis ----------

export const Uncertainty = z.object({
  field: z.string(),
  question_fr: z.string(),
  options: z.array(z.string()).max(3).optional(),
});
export type Uncertainty = z.infer<typeof Uncertainty>;

export const AnalyzeResult = z.object({
  object: z.string(),
  category: RepairCategory,
  problem_visual: z.string(),
  uncertainties: z.array(Uncertainty),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResult>;

// ---------- Clarification ----------

export const ClarifyAnswer = z.object({
  field: z.string(),
  value: z.string(),
});
export type ClarifyAnswer = z.infer<typeof ClarifyAnswer>;

export const ClarifyOptions = z.object({
  uncertainties: z.array(Uncertainty),
});
export type ClarifyOptions = z.infer<typeof ClarifyOptions>;

// ---------- Repair plan ----------

export const RepairStep = z.object({
  step_number: z.number().int().positive(),
  title_fr: z.string(),
  description_fr: z.string(),
  parts_needed: z.array(z.string()),
  tools_needed: z.array(z.string()),
  duration_seconds: z.number().positive(),
  /** Prompt for the START keyframe via gpt-image-2/edit */
  visual_prompt_start: z.string(),
  /** Prompt for the END keyframe via gpt-image-2/edit */
  visual_prompt_end: z.string(),
  /** Motion prompt fed to Seedance image-to-video */
  motion_prompt: z.string(),
  /** Narration text (50–80 words) fed to Gradium TTS */
  narration_fr: z.string(),
});
export type RepairStep = z.infer<typeof RepairStep>;

export const RepairPlan = z.object({
  problem_summary_fr: z.string(),
  difficulty: Difficulty,
  total_duration_min: z.number().positive(),
  steps: z.array(RepairStep).min(2).max(10),
});
export type RepairPlan = z.infer<typeof RepairPlan>;

// ---------- Generated assets ----------

export const Keyframe = z.object({
  step_number: z.number().int().positive(),
  kind: KeyframeKind,
  url: z.string().url(),
});
export type Keyframe = z.infer<typeof Keyframe>;

export const AnimatedClip = z.object({
  step_number: z.number().int().positive(),
  url: z.string().url(),
  duration_seconds: z.number().positive(),
});
export type AnimatedClip = z.infer<typeof AnimatedClip>;

export const NarrationAudio = z.object({
  step_number: z.number().int().positive(),
  url: z.string().url(),
  duration_seconds: z.number().positive(),
});
export type NarrationAudio = z.infer<typeof NarrationAudio>;

export const FinalVideo = z.object({
  url: z.string().url(),
  duration_seconds: z.number().positive(),
});
export type FinalVideo = z.infer<typeof FinalVideo>;

// ---------- API request shapes ----------

export const AnalyzeRequest = z.object({
  photo_url: z.string().url(),
  transcript_fr: z.string().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const ClarifyRequest = z.object({
  analyze: AnalyzeResult,
  /** Provide answers to mark clarification done; omit to request options */
  answers: z.array(ClarifyAnswer).optional(),
});
export type ClarifyRequest = z.infer<typeof ClarifyRequest>;

export const PlanRequest = z.object({
  analyze: AnalyzeResult,
  answers: z.array(ClarifyAnswer).optional(),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const RenderKeyframeRequest = z.object({
  step_number: z.number().int().positive(),
  kind: KeyframeKind,
  reference_url: z.string().url(),
  prompt: z.string(),
  prev_keyframe_url: z.string().url().optional(),
  quality: Quality.default('high'),
  image_size: z.enum(['square', 'landscape_16_9', 'portrait_9_16']).default('landscape_16_9'),
});
export type RenderKeyframeRequest = z.infer<typeof RenderKeyframeRequest>;

export const AnimateStepRequest = z.object({
  step_number: z.number().int().positive(),
  start_frame_url: z.string().url(),
  end_frame_url: z.string().url(),
  motion_prompt: z.string(),
  duration_seconds: z
    .union([
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
    ])
    .default(5),
  resolution: z.enum(['480p', '720p']).default('720p'),
});
export type AnimateStepRequest = z.infer<typeof AnimateStepRequest>;

export const NarrateRequest = z.object({
  step_number: z.number().int().positive(),
  text_fr: z.string().min(1),
  voice_id: z.string().optional(),
  job_id: z.string().optional(),
});
export type NarrateRequest = z.infer<typeof NarrateRequest>;

export const StitchClip = z.object({
  step_number: z.number().int().positive(),
  video_url: z.string().url(),
  audio_url: z.string().url(),
  subtitle_fr: z.string(),
});
export type StitchClip = z.infer<typeof StitchClip>;

export const StitchRequest = z.object({
  clips: z.array(StitchClip).min(1),
  intro_text_fr: z.string().optional(),
});
export type StitchRequest = z.infer<typeof StitchRequest>;

/** Either run a cached demo (demo_id) or run live (photo_url + transcript). */
export const RunRequest = z
  .object({
    demo_id: DemoId.optional(),
    photo_url: z.string().url().optional(),
    transcript_fr: z.string().optional(),
  })
  .refine((v) => Boolean(v.demo_id) || Boolean(v.photo_url), {
    message: 'Provide either demo_id (cached) or photo_url (live).',
  });
export type RunRequest = z.infer<typeof RunRequest>;

export const RunResponse = z.object({
  job_id: z.string(),
  cached: z.boolean(),
});
export type RunResponse = z.infer<typeof RunResponse>;

// ---------- SSE events ----------

/**
 * Discriminated union streamed by GET /api/stream/:jobId.
 * Role A's TerminalStream component matches on `type` to render lines.
 * Role D's orchestrator emits these from /api/run.
 */
export const StreamEvent = z.discriminatedUnion('type', [
  // free-form terminal lines (typewriter, transient logs, ETA, retries)
  z.object({
    type: z.literal('log'),
    message: z.string(),
    severity: z.enum(['info', 'warn', 'error']).optional(),
    transient: z.boolean().optional(),
  }),
  // pipeline milestones
  z.object({ type: z.literal('analyze_done'), result: AnalyzeResult }),
  z.object({ type: z.literal('clarify_needed'), uncertainties: z.array(Uncertainty) }),
  z.object({ type: z.literal('clarify_done') }),
  z.object({ type: z.literal('plan_done'), result: RepairPlan }),
  z.object({
    type: z.literal('keyframe_done'),
    step: z.number().int().positive(),
    kind: KeyframeKind,
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('animation_done'),
    step: z.number().int().positive(),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('narration_done'),
    step: z.number().int().positive(),
    url: z.string().url(),
  }),
  z.object({ type: z.literal('stitch_done'), video_url: z.string().url() }),
  // operational signals
  z.object({ type: z.literal('info'), message: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('done') }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
