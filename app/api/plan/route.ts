/**
 * POST /api/plan
 * Owner: Role B
 *
 * Calls Tavily /research with an outputSchema derived from RepairPlan.
 * If /research underperforms, fall back to /search + /extract + GPT-5.5
 * restructuring. Returns a fully populated RepairPlan with visual_prompt_start,
 * visual_prompt_end, motion_prompt and narration_fr per step (those fields are
 * critical for Role C — they cannot be left blank).
 *
 * TODO(Role B):
 *  - Plug Tavily client (lib/tavily.ts).
 *  - Iterate prompts until the 3 demo photos produce a sensible RepairPlan.
 *  - If Tavily's structured output isn't reliable enough, do a second pass
 *    through gpt-5.5 with the RepairPlan Zod schema.
 */

import { NextResponse } from 'next/server';
import { mockRepairPlan } from '@/lib/mocks';
import { PlanRequest, RepairPlan } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PlanRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // --- MOCK (delete when wiring Tavily) ---
  const plan = RepairPlan.parse(mockRepairPlan());
  return NextResponse.json(plan);
}
