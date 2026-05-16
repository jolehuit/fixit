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

export const DamageExtent = z.enum(['cosmetic', 'functional', 'critical']);
export type DamageExtent = z.infer<typeof DamageExtent>;

export const RepairFeasibility = z.enum(['home_easy', 'home_advanced', 'professional']);
export type RepairFeasibility = z.infer<typeof RepairFeasibility>;

export const Uncertainty = z.object({
  field: z.string(),
  question: z.string(),
  /** Why we ask — shown as tooltip / subtitle in the clarify UI. */
  purpose: z.string().optional(),
  /** Where / how the user finds the answer in the physical world. */
  instruction: z.string().optional(),
  /** Placeholder for the free-text input when no exact match in options. */
  placeholder: z.string().optional(),
  options: z.array(z.string()).max(5).optional(),
});
export type Uncertainty = z.infer<typeof Uncertainty>;

/** Pixel-space coords (% of image box) of where the defect is centered. */
export const DefectMarker = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  label: z.string(),
});
export type DefectMarker = z.infer<typeof DefectMarker>;

export const AnalyzeResult = z.object({
  object: z.string(),
  category: RepairCategory,
  problem_visual: z.string(),
  /** How bad the defect is, beyond visual severity (cosmetic / functional / critical). */
  damage_extent: DamageExtent.optional(),
  /** DIY recommendation: home_easy = anyone, home_advanced = some experience, professional = call a pro. */
  repair_feasibility: RepairFeasibility.optional(),
  /** One-liner ≤10 words describing the skill bar. */
  estimated_skill_level: z.string().optional(),
  /** Up to 4 safety warnings the user should know before starting. */
  safety_warnings: z.array(z.string()).max(4).optional(),
  uncertainties: z.array(Uncertainty),
  /** Where to draw the pulsing marker on the photo. Optional for back-compat. */
  defect_marker: DefectMarker.optional(),
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

export const ShotType = z.enum(['wide', 'medium', 'close-up', 'macro']);
export type ShotType = z.infer<typeof ShotType>;

export const CameraMovement = z.enum([
  'static',
  'subtle_pan_left',
  'subtle_pan_right',
  'subtle_zoom_in',
  'subtle_zoom_out',
]);
export type CameraMovement = z.infer<typeof CameraMovement>;

export const MotionPacing = z.enum(['slow_methodical', 'controlled', 'deliberate']);
export type MotionPacing = z.infer<typeof MotionPacing>;

/**
 * Scene-wide constants injected verbatim into every keyframe + animation prompt.
 *
 * These exist because GPT Image 2 Edit and Seedance need the SAME wording
 * across calls to keep the object's identity, lighting and palette consistent
 * (verified by Seedance 2.0 & GPT Image 2 prompt guides: "preserve composition
 * and colors", "same character", "no variation in appearance").
 */
export const SceneLock = z.object({
  /** The unchanging description of the object — repeated in every keyframe prompt. */
  subject: z.string(),
  environment: z.string(),
  hands_style: z.string(),
  style: z.string(),
  color_palette: z.string(),
  shot_default: ShotType,
  camera_default: CameraMovement,
  /** Phrases injected verbatim into every GPT Image 2 prompt (consistency anchors). */
  consistency_phrases: z.array(z.string()).max(8),
  /** Items to suppress — fed to both image and video models' negative_prompt. */
  negative_cues: z.array(z.string()).max(15),
});
export type SceneLock = z.infer<typeof SceneLock>;

export const RepairPartSummary = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  specification: z.string().optional(),
  /** Direct buy URL (Amazon, manufacturer, retailer). If omitted, the UI
   * auto-generates an Amazon France search link from name + specification. */
  purchase_url: z.string().url().optional(),
});
export type RepairPartSummary = z.infer<typeof RepairPartSummary>;

export const RepairToolSummary = z.object({
  name: z.string(),
  required: z.boolean(),
  specification: z.string().optional(),
});
export type RepairToolSummary = z.infer<typeof RepairToolSummary>;

export const RepairStep = z.object({
  step_number: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  parts_needed: z.array(z.string()),
  tools_needed: z.array(z.string()),
  duration_seconds: z.number().positive(),
  /** Camera distance for this step — overrides scene_lock.shot_default. */
  shot_type: ShotType.optional(),
  /** Camera motion for this step — overrides scene_lock.camera_default. Repair tutorials are almost always `static`. */
  camera_movement: CameraMovement.optional(),
  /** How intense the hands/tools motion should feel. */
  motion_pacing: MotionPacing.optional(),
  /** What the keyframe should anchor on — fed verbatim to GPT Image 2. */
  subject_focus: z.string().optional(),
  /** Prompt for the START keyframe via gpt-image-2/edit */
  visual_prompt_start: z.string(),
  /** Prompt for the END keyframe via gpt-image-2/edit */
  visual_prompt_end: z.string(),
  /** Motion prompt fed to Seedance image-to-video */
  motion_prompt: z.string(),
  /** Narration text (50–80 words) fed to Gradium TTS */
  narration: z.string(),
  /** ≤8 words burned-in subtitle (1 line), summary of the narration. */
  subtitle: z.string().optional(),
  /** Specific safety warning for THIS step (battery short, sharp edges…). */
  safety_note: z.string().optional(),
  /** How the user verifies the step succeeded. */
  success_criteria: z.string().optional(),
  /** Common mistake / failure mode to avoid. */
  common_mistake: z.string().optional(),
});
export type RepairStep = z.infer<typeof RepairStep>;

export const RepairPlan = z.object({
  problem_summary: z.string(),
  difficulty: Difficulty,
  total_duration_min: z.number().positive(),
  /** Parts cost range in € — pieces only, no labour. */
  estimated_cost_eur: z
    .object({
      parts_low: z.number().min(0),
      parts_high: z.number().min(0),
    })
    .optional(),
  /** Global safety warnings BEFORE starting (power off, eye protection…). */
  safety_pre_check: z.array(z.string()).max(4).optional(),
  /** Consolidated parts list across all steps. */
  parts_summary: z.array(RepairPartSummary).optional(),
  /** Consolidated tools list across all steps. */
  tools_summary: z.array(RepairToolSummary).optional(),
  /** Scene-wide constants for visual + video consistency. */
  scene_lock: SceneLock.optional(),
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
  transcript: z.string().optional(),
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
  /** Scene-wide constants from the plan — injected into the GPT Image 2 prompt for consistency. */
  scene_lock: SceneLock.optional(),
  /** What this keyframe should anchor on (e.g. "the lower-left pentalobe screw"). */
  subject_focus: z.string().optional(),
  /** Camera framing for this step (override of scene_lock.shot_default). */
  shot_type: ShotType.optional(),
});
export type RenderKeyframeRequest = z.infer<typeof RenderKeyframeRequest>;

export const AnimateStepRequest = z.object({
  step_number: z.number().int().positive(),
  start_frame_url: z.string().url(),
  end_frame_url: z.string().url(),
  motion_prompt: z.string(),
  duration_seconds: z
    .union([z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)])
    .default(5),
  resolution: z.enum(['480p', '720p']).default('720p'),
  /** Additional negative cues to merge with the route's built-in list. */
  negative_cues: z.array(z.string()).optional(),
  /** Motion pacing hint — folded into the Seedance scene wrapper. */
  motion_pacing: MotionPacing.optional(),
  /** Camera movement hint — almost always 'static' for repair tutorials. */
  camera_movement: CameraMovement.optional(),
});
export type AnimateStepRequest = z.infer<typeof AnimateStepRequest>;

export const NarrateRequest = z.object({
  step_number: z.number().int().positive(),
  text: z.string().min(1),
  voice_id: z.string().optional(),
  job_id: z.string().optional(),
});
export type NarrateRequest = z.infer<typeof NarrateRequest>;

export const StitchClip = z.object({
  step_number: z.number().int().positive(),
  video_url: z.string().url(),
  audio_url: z.string().url(),
  subtitle: z.string(),
});
export type StitchClip = z.infer<typeof StitchClip>;

export const StitchRequest = z.object({
  clips: z.array(StitchClip).min(1),
  intro_text: z.string().optional(),
});
export type StitchRequest = z.infer<typeof StitchRequest>;

/**
 * Photo path is the source of truth; demo_id is an OPTIONAL hint that lets
 * /api/run skip the photo classifier and route directly to the cached replay
 * when the user clicks a known demo card. Free uploads omit it and trigger
 * either classify→cache or live based on configuration.
 */
export const RunRequest = z.object({
  photo_url: z.string().url(),
  transcript: z.string().optional(),
  demo_id: DemoId.optional(),
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
