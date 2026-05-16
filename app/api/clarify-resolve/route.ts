/**
 * POST /api/clarify-resolve
 * Owner: Role D
 *
 * Resolves the orchestrator's pause at `clarify_needed` with user answers.
 * The orchestrator awaits via `waitForClarify(jobId)` and proceeds to /api/plan
 * with these answers fed in. A no-op response (404) means the orchestrator
 * already moved on (timeout exceeded, or no clarify was pending for this job).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveClarify } from '@/lib/jobs';
import { ClarifyAnswer } from '@/lib/types';

export const runtime = 'nodejs';

const Body = z.object({
  job_id: z.string().min(1),
  answers: z.array(ClarifyAnswer),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const accepted = resolveClarify(parsed.data.job_id, parsed.data.answers);
  if (!accepted) {
    return NextResponse.json(
      { error: 'no_pending_clarify', message: 'The orchestrator already proceeded.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ accepted: true });
}
