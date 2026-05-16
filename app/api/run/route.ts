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
import { closeJob, createJob, emit, newJobId, setPhoto, waitForClarify } from '@/lib/jobs';
import {
  type AnalyzeResult,
  type ClarifyAnswer,
  type RepairPlan,
  type RepairStep,
  RunRequest,
  RunResponse,
  type StitchClip,
} from '@/lib/types';

/** How long the orchestrator pauses on clarify_needed for user answers. */
const CLARIFY_WAIT_MS = 45_000;

/**
 * Iteration toggle: when true, the orchestrator stops right after `plan_done`
 * (no keyframes / animate / narrate / stitch). Keeps fal/Gradium credits intact
 * while we audit the generated script in the dev terminal. Flip to `false`
 * once the prompts are good enough to commit to a full video run.
 */
const SKIP_VIDEO_GENERATION = false;

/** Pretty-print the full repair plan to the dev terminal before generation. */
function logRepairPlan(jobId: string, plan: RepairPlan): void {
  const sep = '─'.repeat(72);
  const lines: string[] = [
    '',
    sep,
    `[plan] job=${jobId}`,
    `  summary    : ${plan.problem_summary_fr}`,
    `  difficulty : ${plan.difficulty}`,
    `  duration   : ~${plan.total_duration_min} min`,
    `  steps      : ${plan.steps.length}`,
    sep,
  ];
  for (const s of plan.steps) {
    lines.push(`Step ${s.step_number} — ${s.title_fr} (${s.duration_seconds}s)`);
    lines.push(`  description : ${s.description_fr}`);
    if (s.parts_needed.length) {
      lines.push(`  parts       : ${s.parts_needed.join(', ')}`);
    }
    if (s.tools_needed.length) {
      lines.push(`  tools       : ${s.tools_needed.join(', ')}`);
    }
    lines.push(`  visual.start: ${s.visual_prompt_start}`);
    lines.push(`  visual.end  : ${s.visual_prompt_end}`);
    lines.push(`  motion      : ${s.motion_prompt}`);
    lines.push(`  narration   : ${s.narration_fr}`);
    lines.push('');
  }
  lines.push(sep);
  // Single console.log so the block stays atomic in concurrent runs.
  console.log(lines.join('\n'));
}

export const runtime = 'nodejs';
export const maxDuration = 800;

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

  void runLive(jobId, {
    photo_url: parsed.data.photo_url,
    transcript_fr: parsed.data.transcript_fr,
  });
  return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: false }));
}

// ---------- Live path ----------

async function runLive(jobId: string, input: { photo_url: string; transcript_fr?: string }) {
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
    emit(jobId, { type: 'log', message: '> Fixit — pipeline live démarré…' });
    emit(jobId, {
      type: 'info',
      message: 'Pipeline live : GPT-5.5 + fal + Tavily + Gradium. ETA 60–120 s.',
    });

    // ── 1. Analyze ─────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: "⠋ Analyse de l'image (GPT-5.5 vision, detail:auto)…",
      transient: true,
    });

    const analyzeResult = await post<AnalyzeResult>('/api/analyze', {
      photo_url: input.photo_url,
      transcript_fr: input.transcript_fr,
    });

    emit(jobId, { type: 'analyze_done', result: analyzeResult });
    emit(jobId, { type: 'log', message: `✓ Objet identifié : ${analyzeResult.object}` });

    // ── 2. Clarify (interactive — pause until the user answers or timeout) ─
    let userAnswers: ClarifyAnswer[] | null = null;
    if (analyzeResult.uncertainties.length > 0) {
      emit(jobId, { type: 'clarify_needed', uncertainties: analyzeResult.uncertainties });
      emit(jobId, {
        type: 'log',
        message: `⠋ ${analyzeResult.uncertainties.length} question(s) — en attente de tes réponses…`,
        transient: true,
      });
      userAnswers = await waitForClarify(jobId, CLARIFY_WAIT_MS);
      if (userAnswers) {
        emit(jobId, { type: 'clarify_done' });
        emit(jobId, {
          type: 'log',
          message: `✓ Réponses reçues (${userAnswers.length}) — affinage de la procédure`,
        });
      } else {
        emit(jobId, {
          type: 'log',
          message: '⚠ Pas de réponse dans le temps imparti — procédure la plus probable retenue',
          severity: 'warn',
        });
      }
    }

    // ── 3. Plan ────────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Recherche de procédures (Tavily + GPT-5.5)…',
      transient: true,
    });

    const repairPlan = await post<RepairPlan>('/api/plan', {
      analyze: analyzeResult,
      answers: userAnswers ?? undefined,
    });

    emit(jobId, { type: 'plan_done', result: repairPlan });
    emit(jobId, {
      type: 'log',
      message: `✓ Plan : ${repairPlan.steps.length} étapes · ${repairPlan.total_duration_min} min · ${repairPlan.difficulty}`,
    });

    // Debug dump: print the full plan to the dev server terminal BEFORE we
    // hand off to fal/Seedance/Gradium. Useful to inspect what each generator
    // will actually receive (visual prompts, motion prompts, narration).
    logRepairPlan(jobId, repairPlan);

    // ⚠️ Video generation suspended for script-review iteration.
    // Re-enable by removing this block once the plan output is validated.
    if (SKIP_VIDEO_GENERATION) {
      emit(jobId, {
        type: 'info',
        message:
          'Plan ready. Video generation suspended (script-review mode). Check the dev terminal for the full plan.',
      });
      emit(jobId, { type: 'done' });
      return;
    }

    // ── 4. Per-step : keyframe → animate + narrate ─────────────────────────
    // Step 1 runs first alone so we can measure latency and downgrade quality if needed.
    // Steps 2-N run in parallel once step 1 resolves.

    emit(jobId, {
      type: 'log',
      message: `⠋ Génération keyframes + animation + narration (${repairPlan.steps.length} étapes)…`,
      transient: true,
    });

    async function processStep(step: RepairStep): Promise<StitchClip> {
      const i = step.step_number;

      // Keyframe start
      const kfStart = await post<{ step_number: number; kind: string; url: string }>(
        '/api/render-keyframe',
        {
          step_number: i,
          kind: 'start',
          reference_url: input.photo_url,
          prompt: step.visual_prompt_start,
          quality,
          image_size: 'landscape_16_9',
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
        }),
        post<{ step_number: number; url: string; duration_seconds: number }>('/api/narrate', {
          step_number: i,
          text_fr: step.narration_fr,
          job_id: jobId,
        }),
      ]);

      emit(jobId, { type: 'animation_done', step: i, url: anim.url });
      emit(jobId, { type: 'narration_done', step: i, url: narr.url });

      return {
        step_number: i,
        video_url: anim.url,
        audio_url: narr.url,
        subtitle_fr: step.narration_fr,
      };
    }

    // Étape 1 seule d'abord (mesure de latence)
    const t0 = Date.now();
    const clip1 = await processStep(repairPlan.steps[0]);

    // Downgrade qualité si keyframe > 25s
    if (Date.now() - t0 > 25_000) {
      quality = 'medium';
      emit(jobId, {
        type: 'info',
        message: 'quality:high > 25 s — passage à quality:medium pour les étapes suivantes',
      });
    }

    // Étapes restantes en parallèle
    const remainingClips = await Promise.all(repairPlan.steps.slice(1).map(processStep));
    const clips: StitchClip[] = [clip1, ...remainingClips];

    // ── 5. Stitch ──────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Montage ffmpeg · concat + narration + sous-titres FR…',
      transient: true,
    });

    const finalVideo = await post<{ url: string; duration_seconds: number }>('/api/stitch', {
      clips,
      intro_text_fr: repairPlan.problem_summary_fr,
    });

    emit(jobId, { type: 'stitch_done', video_url: finalVideo.url });
    emit(jobId, {
      type: 'log',
      message: `✓ Vidéo finale prête · ${Math.round(finalVideo.duration_seconds)} s · 720p · narration FR + sous-titres`,
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
