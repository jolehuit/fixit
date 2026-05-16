/**
 * POST /api/run
 * Owner: Role D
 *
 * Two paths:
 *   A) demo_id → replay a cached SSE script (guaranteed wow effect for jury)
 *   B) photo_url + transcript → real pipeline:
 *        analyze → (clarify) → plan → ∥ per-step(keyframe×2 + animate + narrate) → stitch
 */

import { NextResponse } from 'next/server';
import { demoScripts, demos } from '@/lib/demos';
import { closeJob, createJob, emit, newJobId } from '@/lib/jobs';
import {
  type AnalyzeResult,
  type RepairPlan,
  type RepairStep,
  type StitchClip,
  RunRequest,
  RunResponse,
  type StreamEvent,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 800;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

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

  if (parsed.data.demo_id) {
    const script = demoScripts[parsed.data.demo_id];
    void runCached(jobId, script, parsed.data.demo_id);
    return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: true }));
  }

  void runLive(jobId, parsed.data);
  return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: false }));
}

// ---------- Cached path ----------

async function runCached(
  jobId: string,
  script: (typeof demoScripts)[keyof typeof demoScripts],
  demoId: keyof typeof demos,
) {
  try {
    emit(jobId, { type: 'log', message: `> Démo : ${demos[demoId].title_fr}` });
    await script((ev: StreamEvent) => emit(jobId, ev), sleep);
  } catch (err) {
    emit(jobId, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Demo script crashed',
    });
  } finally {
    closeJob(jobId);
  }
}

// ---------- Live path ----------

async function runLive(jobId: string, input: { photo_url?: string; transcript_fr?: string }) {
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
    if (!input.photo_url) throw new Error('photo_url manquant pour le mode live');

    emit(jobId, { type: 'log', message: '> Fixit — pipeline live démarré…' });
    emit(jobId, {
      type: 'info',
      message: 'Pipeline live : GPT-5.5 + fal + Tavily + Gradium. ETA 60–120 s.',
    });

    // ── 1. Analyze ─────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Analyse de l\'image (GPT-5.5 vision, detail:auto)…',
      transient: true,
    });

    const analyzeResult = await post<AnalyzeResult>('/api/analyze', {
      photo_url: input.photo_url,
      transcript_fr: input.transcript_fr,
    });

    emit(jobId, { type: 'analyze_done', result: analyzeResult });
    emit(jobId, { type: 'log', message: `✓ Objet identifié : ${analyzeResult.object}` });

    // ── 2. Clarify (non-bloquant : on signale mais on continue) ────────────
    if (analyzeResult.uncertainties.length > 0) {
      emit(jobId, { type: 'clarify_needed', uncertainties: analyzeResult.uncertainties });
      emit(jobId, {
        type: 'log',
        message: `⚠ ${analyzeResult.uncertainties.length} incertitude(s) — procédure la plus probable retenue`,
        severity: 'warn',
      });
    }

    // ── 3. Plan ────────────────────────────────────────────────────────────
    emit(jobId, {
      type: 'log',
      message: '⠋ Recherche de procédures (Tavily + GPT-5.5)…',
      transient: true,
    });

    const repairPlan = await post<RepairPlan>('/api/plan', {
      analyze: analyzeResult,
    });

    emit(jobId, { type: 'plan_done', result: repairPlan });
    emit(jobId, {
      type: 'log',
      message: `✓ Plan : ${repairPlan.steps.length} étapes · ${repairPlan.total_duration_min} min · ${repairPlan.difficulty}`,
    });

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
