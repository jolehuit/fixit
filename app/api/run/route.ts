/**
 * POST /api/run
 * Owner: Role D
 *
 * Single path — live pipeline:
 *   analyze → (clarify) → plan → ∥ per-step(keyframe×2 + animate + narrate) → stitch
 *
 * The previous cached-SSE-script path was removed: it emitted stale mock
 * data that no longer matches the structured English output of the real
 * pipeline. A proper perceptual-hash cache router will replace it later.
 * For now, demo cards run the same live pipeline as user uploads (the
 * client encodes the pre-shot photo into a data URL before posting).
 */

import { NextResponse } from 'next/server';
import { getDemoManifestUrl, isCachedDemo } from '@/lib/demo-cache';
import { closeJob, createJob, emit, newJobId, setPhoto, waitForClarify } from '@/lib/jobs';
import {
  type AnalyzeResult,
  type ClarifyAnswer,
  type DemoId,
  DemoManifest,
  type RepairPlan,
  type RepairStep,
  RunRequest,
  RunResponse,
} from '@/lib/types';

/** How long the orchestrator pauses on clarify_needed for user answers. */
const CLARIFY_WAIT_MS = 45_000;

/**
 * Iteration toggle: when true, the orchestrator stops right after `plan_done`
 * (no keyframes / animate / narrate / stitch). Keeps fal/Gradium credits intact
 * while we audit the generated script in the dev terminal. Flip to `false`
 * once the prompts are good enough to commit to a full video run.
 */
const SKIP_VIDEO_GENERATION = true;

/** Pretty-print the full repair plan to the dev terminal before generation. */
function logRepairPlan(jobId: string, plan: RepairPlan): void {
  const sep = '─'.repeat(72);
  const lines: string[] = [
    '',
    sep,
    `[plan] job=${jobId}`,
    `  summary    : ${plan.problem_summary}`,
    `  difficulty : ${plan.difficulty}`,
    `  duration   : ~${plan.total_duration_min} min`,
    `  steps      : ${plan.steps.length}`,
    sep,
  ];
  for (const s of plan.steps) {
    lines.push(`Step ${s.step_number} — ${s.title} (${s.duration_seconds}s)`);
    lines.push(`  description : ${s.description}`);
    if (s.parts_needed.length) {
      lines.push(`  parts       : ${s.parts_needed.join(', ')}`);
    }
    if (s.tools_needed.length) {
      lines.push(`  tools       : ${s.tools_needed.join(', ')}`);
    }
    lines.push(`  visual.start: ${s.visual_prompt_start}`);
    lines.push(`  visual.end  : ${s.visual_prompt_end}`);
    lines.push(`  motion      : ${s.motion_prompt}`);
    lines.push(`  narration   : ${s.narration}`);
    lines.push('');
  }
  lines.push(sep);
  // Single console.log so the block stays atomic in concurrent runs.
  console.log(lines.join('\n'));
}

export const runtime = 'nodejs';
export const maxDuration = 300;

// Base URL for internal fetch calls (Vercel sets VERCEL_URL automatically).
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

// ---------- Entry point ----------

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = RunRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const jobId = newJobId();
  createJob(jobId);
  // Stash the input photo server-side so the frontend can fetch it via
  // /api/jobs/<id>/photo without dealing with sessionStorage quotas.
  setPhoto(jobId, parsed.data.photo_url);

  // ── Cache routing ──────────────────────────────────────────────────────
  // 1. Demo card click → explicit demo_id hint → skip classifier
  // 2. Free upload → call /api/classify-photo to detect bike/phone/faucet
  // 3. Otherwise → fall back to live pipeline
  const demoHint = parsed.data.demo_id;
  if (demoHint && isCachedDemo(demoHint)) {
    void runCached(jobId, demoHint);
    return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: true }));
  }

  const classified = await classifyPhoto(parsed.data.photo_url);
  if (classified && classified !== 'none' && isCachedDemo(classified)) {
    void runCached(jobId, classified);
    return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: true }));
  }

  void runLive(jobId, {
    photo_url: parsed.data.photo_url,
    transcript: parsed.data.transcript,
  });
  return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: false }));
}

/** Quick photo classification via /api/classify-photo. Non-fatal on error. */
async function classifyPhoto(photoUrl: string): Promise<DemoId | 'none' | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/classify-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_url: photoUrl }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { match?: string };
    if (
      json.match === 'flat-tire' ||
      json.match === 'cracked-screen' ||
      json.match === 'dripping-faucet' ||
      json.match === 'none'
    ) {
      return json.match;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- Live path ----------

async function runLive(jobId: string, input: { photo_url: string; transcript?: string }) {
  // Helper: POST to an internal route and return parsed JSON.
  // Throws a descriptive error on non-2xx so the catch block surfaces it.
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  // Quality tier — starts at 'high', downgrades to 'medium' if step 1 is slow.
  let quality: 'high' | 'medium' = 'high';

  try {
    emit(jobId, { type: 'log', message: '> Fixit — diagnosis started…' });
    emit(jobId, {
      type: 'info',
      message: 'Diagnosis in progress. ETA 60–120 s.',
    });

    // ── 1. Analyze ─────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Analyzing the image…',
      transient: true,
    });

    const analyzeResult = await post<AnalyzeResult>('/api/analyze', {
      photo_url: input.photo_url,
      transcript: input.transcript,
    });

    emit(jobId, { type: 'analyze_done', result: analyzeResult });
    emit(jobId, { type: 'log', message: `✓ Object identified: ${analyzeResult.object}` });

    // ── 2. Clarify (interactive — pause until the user answers or timeout) ─
    let userAnswers: ClarifyAnswer[] | null = null;
    if (analyzeResult.uncertainties.length > 0) {
      emit(jobId, { type: 'clarify_needed', uncertainties: analyzeResult.uncertainties });
      emit(jobId, {
        type: 'log',
        message: `⠋ ${analyzeResult.uncertainties.length} question(s) — waiting for your answers…`,
        transient: true,
      });
      userAnswers = await waitForClarify(jobId, CLARIFY_WAIT_MS);
      if (userAnswers) {
        emit(jobId, { type: 'clarify_done' });
        emit(jobId, {
          type: 'log',
          message: `✓ Answers received (${userAnswers.length}) — refining the procedure`,
        });
      } else {
        emit(jobId, {
          type: 'log',
          message: '⚠ No answer in time — using most probable procedure',
          severity: 'warn',
        });
      }
    }

    // ── 3. Plan ────────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Searching repair procedures…',
      transient: true,
    });

    const repairPlan = await post<RepairPlan>('/api/plan', {
      analyze: analyzeResult,
      answers: userAnswers ?? undefined,
    });

    emit(jobId, { type: 'plan_done', result: repairPlan });
    emit(jobId, {
      type: 'log',
      message: `✓ Plan: ${repairPlan.steps.length} steps · ${repairPlan.total_duration_min} min · ${repairPlan.difficulty}`,
    });

    // Debug dump: print the full plan to the dev server terminal BEFORE we
    // hand off to fal/Seedance/Gradium. Useful to inspect what each generator
    // will actually receive (visual prompts, motion prompts, narration).
    logRepairPlan(jobId, repairPlan);

    // ⚠️ Video generation suspended for script-review iteration.
    // Re-enable by removing this block once the plan output is validated.
    // The photo marker still appears on plan_done (frontend uses Boolean(plan))
    // — it's visible but click is disabled until chapters/video are ready.
    if (SKIP_VIDEO_GENERATION) {
      emit(jobId, {
        type: 'info',
        message: 'Plan ready. Video generation disabled (test mode).',
      });
      emit(jobId, { type: 'done' });
      return;
    }

    // ── 4. Per-step : keyframe → animate + narrate ─────────────────────────
    // Step 1 runs first alone so we can measure latency and downgrade quality if needed.
    // Steps 2-N run in parallel once step 1 resolves.

    emit(jobId, {
      type: 'log',
      message: `⠋ Generating step visuals and audio (${repairPlan.steps.length} steps)…`,
      transient: true,
    });

    async function processStep(step: RepairStep): Promise<void> {
      const i = step.step_number;

      // Keyframe start — pass scene_lock + per-step focus/shot for consistent visuals.
      const kfStart = await post<{ step_number: number; kind: string; url: string }>(
        '/api/render-keyframe',
        {
          step_number: i,
          kind: 'start',
          reference_url: input.photo_url,
          prompt: step.visual_prompt_start,
          quality,
          image_size: 'landscape_16_9',
          scene_lock: repairPlan.scene_lock,
          subject_focus: step.subject_focus,
          shot_type: step.shot_type,
        },
      );
      emit(jobId, { type: 'keyframe_done', step: i, kind: 'start', url: kfStart.url });

      // Keyframe end (référence = photo d'origine + keyframe start pour la continuité)
      const kfEnd = await post<{ step_number: number; kind: string; url: string }>(
        '/api/render-keyframe',
        {
          step_number: i,
          kind: 'end',
          reference_url: input.photo_url,
          prev_keyframe_url: kfStart.url,
          prompt: step.visual_prompt_end,
          quality,
          image_size: 'landscape_16_9',
          scene_lock: repairPlan.scene_lock,
          subject_focus: step.subject_focus,
          shot_type: step.shot_type,
        },
      );
      emit(jobId, { type: 'keyframe_done', step: i, kind: 'end', url: kfEnd.url });

      // Animate + narrate en parallèle (pas de dépendance entre eux)
      const [anim, narr] = await Promise.all([
        post<{ step_number: number; url: string; duration_seconds: number }>('/api/animate-step', {
          step_number: i,
          start_frame_url: kfStart.url,
          end_frame_url: kfEnd.url,
          motion_prompt: step.motion_prompt,
          duration_seconds: 5,
          resolution: '720p',
          negative_cues: repairPlan.scene_lock?.negative_cues,
          motion_pacing: step.motion_pacing,
          camera_movement: step.camera_movement ?? repairPlan.scene_lock?.camera_default,
        }),
        post<{ step_number: number; url: string; duration_seconds: number }>('/api/narrate', {
          step_number: i,
          text: step.narration,
          job_id: jobId,
        }),
      ]);

      emit(jobId, { type: 'animation_done', step: i, url: anim.url });
      emit(jobId, { type: 'narration_done', step: i, url: narr.url });
    }

    // Étape 1 seule d'abord (mesure de latence)
    const t0 = Date.now();
    await processStep(repairPlan.steps[0]);

    // Downgrade qualité si keyframe > 25s
    if (Date.now() - t0 > 25_000) {
      quality = 'medium';
      emit(jobId, {
        type: 'info',
        message: 'Slow start — switching to faster quality for next steps',
      });
    }

    // Étapes restantes en parallèle
    await Promise.all(repairPlan.steps.slice(1).map(processStep));

    // ── 5. Chapter player ─────────────────────────────────────────────────
    // No more ffmpeg stitch — the frontend assembles a chapter-style player
    // from the per-step animation_done + narration_done URLs already streamed.
    emit(jobId, { type: 'chapters_ready' });
    emit(jobId, {
      type: 'log',
      message: `✓ ${repairPlan.steps.length} chapters ready · loop-on-step interactive tutorial`,
    });
    emit(jobId, { type: 'done' });
  } catch (err) {
    emit(jobId, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Live pipeline crashed',
    });
  } finally {
    closeJob(jobId);
  }
}

// ---------- Cached path (replay pre-baked manifest) -----------------------

/**
 * Replay a believable live pipeline timeline from a pre-baked DemoManifest.
 *
 * Fetches a single manifest.json on Blob (CDN-cached), Zod-validates, then
 * emits SSE events with absolute setTimeout offsets so the run "feels" live
 * (~120s for ~6 steps). Per-step events use the REAL Blob URLs from the
 * manifest, so the chapter player opens with the cached video + audio when
 * the user clicks the CTA.
 */
async function runCached(jobId: string, demoId: DemoId) {
  const manifestUrl = getDemoManifestUrl(demoId);

  try {
    const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
    if (!manifestRes.ok) throw new Error(`manifest ${manifestRes.status}`);
    const manifest = DemoManifest.parse(await manifestRes.json());
    const analyze = manifest.analyze;
    const plan = manifest.plan;
    const stepsById = new Map(manifest.steps.map((s) => [s.step_number, s]));

    // ── Timing budget (ms) ──
    const T_initLog = 0;
    const T_initInfo = 500;
    const T_analyzeStart = 1_000;
    const T_analyzeDone = 12_000;
    const T_objectLog = 12_500;
    const T_clarifyNeeded = 13_500;
    const T_clarifyWaitLog = 14_000;
    const T_clarifyDone = 24_000;
    const T_clarifyDoneLog = 24_500;
    const T_planStart = 25_000;
    const T_planDone = 55_000;
    const T_planSummaryLog = 55_500;
    const T_stepStart = 58_000;
    const STEP_DURATION = 7_000; // per step total (kf_start + kf_end + anim + narr)
    const N = plan.steps.length;
    const T_stitchStartLog = T_stepStart + N * STEP_DURATION;
    const T_stitchDone = T_stitchStartLog + 5_000;
    const T_finalLog = T_stitchDone + 500;
    const T_done = T_stitchDone + 700;

    const emitAt = (delay: number, eventFn: () => void) => {
      setTimeout(() => {
        try {
          eventFn();
        } catch {
          // never let a single emit kill the replay
        }
      }, delay);
    };

    emitAt(T_initLog, () => emit(jobId, { type: 'log', message: '> Fixit — diagnosis started…' }));
    emitAt(T_initInfo, () =>
      emit(jobId, {
        type: 'info',
        message: 'Diagnosis in progress. ETA 60–120 s.',
      }),
    );
    emitAt(T_analyzeStart, () =>
      emit(jobId, {
        type: 'log',
        message: '⠋ Analyzing the image…',
        transient: true,
      }),
    );
    emitAt(T_analyzeDone, () => emit(jobId, { type: 'analyze_done', result: analyze }));
    emitAt(T_objectLog, () =>
      emit(jobId, { type: 'log', message: `✓ Object identified: ${analyze.object.slice(0, 100)}` }),
    );

    if (analyze.uncertainties.length > 0) {
      emitAt(T_clarifyNeeded, () =>
        emit(jobId, { type: 'clarify_needed', uncertainties: analyze.uncertainties }),
      );
      emitAt(T_clarifyWaitLog, () =>
        emit(jobId, {
          type: 'log',
          message: `⠋ ${analyze.uncertainties.length} question(s) — waiting for your answers…`,
          transient: true,
        }),
      );
      emitAt(T_clarifyDone, () => emit(jobId, { type: 'clarify_done' }));
      emitAt(T_clarifyDoneLog, () => emit(jobId, { type: 'log', message: '✓ Answers received' }));
    }

    emitAt(T_planStart, () =>
      emit(jobId, {
        type: 'log',
        message: '⠋ Searching repair procedures…',
        transient: true,
      }),
    );
    emitAt(T_planDone, () => emit(jobId, { type: 'plan_done', result: plan }));
    emitAt(T_planSummaryLog, () =>
      emit(jobId, {
        type: 'log',
        message: `✓ Plan: ${plan.steps.length} steps · ${plan.total_duration_min} min · ${plan.difficulty}`,
      }),
    );

    // Per-step events — use REAL Blob URLs from the manifest so the
    // chapter player can open with the cached video + audio.
    for (let i = 0; i < N; i++) {
      const step = plan.steps[i];
      const cached = stepsById.get(step.step_number);
      const base = T_stepStart + i * STEP_DURATION;
      const startUrl = cached?.keyframe_start_url ?? cached?.video_url;
      const endUrl = cached?.keyframe_end_url ?? cached?.video_url;

      if (startUrl) {
        emitAt(base + 0, () =>
          emit(jobId, {
            type: 'keyframe_done',
            step: step.step_number,
            kind: 'start',
            url: startUrl,
          }),
        );
      }
      if (endUrl) {
        emitAt(base + 2_000, () =>
          emit(jobId, {
            type: 'keyframe_done',
            step: step.step_number,
            kind: 'end',
            url: endUrl,
          }),
        );
      }
      if (cached) {
        emitAt(base + 4_500, () =>
          emit(jobId, {
            type: 'animation_done',
            step: step.step_number,
            url: cached.video_url,
          }),
        );
        emitAt(base + 5_500, () =>
          emit(jobId, {
            type: 'narration_done',
            step: step.step_number,
            url: cached.audio_url,
          }),
        );
      }
    }

    // Replace the legacy stitch step with the chapter-player handoff.
    emitAt(T_stitchStartLog, () =>
      emit(jobId, {
        type: 'log',
        message: '⠋ Assembling chapter player…',
        transient: true,
      }),
    );
    emitAt(T_stitchDone, () => emit(jobId, { type: 'chapters_ready' }));
    emitAt(T_finalLog, () =>
      emit(jobId, {
        type: 'log',
        message: `✓ ${N} chapters ready · loop-on-step interactive tutorial`,
      }),
    );
    emitAt(T_done, () => {
      emit(jobId, { type: 'done' });
      closeJob(jobId);
    });
  } catch (err) {
    emit(jobId, {
      type: 'error',
      message:
        err instanceof Error ? `Cached replay failed: ${err.message}` : 'Cached replay crashed',
    });
    closeJob(jobId);
  }
}
