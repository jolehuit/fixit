/**
 * POST /api/run
 * Owner: Role D
 *
 * Top-level orchestrator. Two paths:
 *
 *   A) demo_id present → look up the cached demo script in lib/demos and
 *      replay it (typewriter pacing) so the jury sees the wow rhythm with
 *      a guaranteed final video. Sets `cached: true` in the response.
 *
 *   B) photo_url + transcript present → run the real pipeline:
 *        analyze → (clarify) → plan → ∥ per-step(render×2 + animate + narrate) → stitch
 *      Emits StreamEvents at every milestone via lib/jobs.
 *
 * Returns { job_id, cached } immediately. The client then opens
 * GET /api/stream/:jobId for the SSE feed.
 */

import { NextResponse } from 'next/server';
import { demoScripts, demos } from '@/lib/demos';
import { closeJob, createJob, emit, newJobId } from '@/lib/jobs';
import { RunRequest, RunResponse, type StreamEvent } from '@/lib/types';

export const runtime = 'nodejs';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

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

  // Kick off async; do NOT await — the client will subscribe via the SSE
  // route and the orchestrator emits as it progresses.
  if (parsed.data.demo_id) {
    const script = demoScripts[parsed.data.demo_id];
    void runCached(jobId, script, parsed.data.demo_id);
    return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: true }));
  }

  void runLive(jobId, parsed.data);
  return NextResponse.json(RunResponse.parse({ job_id: jobId, cached: false }));
}

async function runCached(
  jobId: string,
  script: (typeof demoScripts)[keyof typeof demoScripts],
  demoId: keyof typeof demos,
) {
  try {
    emit(jobId, {
      type: 'log',
      message: `> Cached demo: ${demos[demoId].title_fr}`,
    });
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

async function runLive(jobId: string, input: { photo_url?: string; transcript_fr?: string }) {
  try {
    emit(jobId, { type: 'log', message: '> Live pipeline starting…' });
    emit(jobId, {
      type: 'info',
      message: 'Live mode runs the real GPT-5.5 + fal + Tavily + Gradium chain. ETA 60–120s.',
    });

    // ---- TODO(Role D) ----
    // 1. POST /api/analyze with { photo_url, transcript_fr }
    //    → emit('analyze_done', result)
    // 2. If result.uncertainties.length > 0:
    //      POST /api/clarify (no answers) → emit('clarify_needed', ...)
    //      Wait for the client to POST /api/clarify with answers
    //      → emit('clarify_done')
    // 3. POST /api/plan → emit('plan_done', result)
    // 4. For each step in parallel (Promise.all):
    //      a. POST /api/render-keyframe (start) → emit('keyframe_done', step, 'start')
    //      b. POST /api/render-keyframe (end)   → emit('keyframe_done', step, 'end')
    //      c. POST /api/animate-step            → emit('animation_done', step)
    //      d. POST /api/narrate                  → emit('narration_done', step)
    // 5. POST /api/stitch with all clips → emit('stitch_done', video_url)
    // 6. emit('done')
    //
    // Implementation note: prefer calling the lib/* helpers directly here
    // rather than HTTP-roundtripping through the API routes, since this code
    // is already server-side. The HTTP routes exist so Roles A/B/C can test
    // independently via curl or the browser DevTools network tab.
    // ----------------------

    emit(jobId, {
      type: 'error',
      message: 'Live pipeline not yet implemented — see TODO(Role D) in app/api/run/route.ts',
    });
  } catch (err) {
    emit(jobId, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Live pipeline crashed',
    });
  } finally {
    closeJob(jobId);
  }

  // Silence "_input is unused" — keep the signature stable for when the real
  // implementation lands.
  void input;
}
