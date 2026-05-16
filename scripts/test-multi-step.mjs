#!/usr/bin/env node
// Multi-step pipeline test for Role C.
//
// Reads a plan JSON (steps[] of arbitrary length), runs every step in PARALLEL:
//   per step:  render-start → render-end → (animate || narrate)
//   across steps: Promise.all
// then calls /api/stitch with all N clips.
//
// Designed so Dev B's eventual /api/plan output can be dropped in as-is
// (same shape as the JSON in scripts/plans/*.json) and Dev D's orchestrator
// can mirror this loop in /api/run.
//
// Usage:
//   pnpm dev                                              # in another terminal
//   REF="https://v3b.fal.media/files/.../bike.png" \
//     node scripts/test-multi-step.mjs scripts/plans/cracked-screen.json
//
// Optional env: BASE=http://localhost:3000 (default)

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const REF = process.env.REF;
const planArg = process.argv[2] ?? 'scripts/plans/cracked-screen.json';
const PLAN_PATH = resolve(process.cwd(), planArg);

if (!REF) {
  console.error('REF=<public image URL> required (use scripts/upload-image.mjs to get one)');
  process.exit(1);
}

let plan;
try {
  plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
} catch (err) {
  console.error(`Failed to read plan ${PLAN_PATH}:`, err.message);
  process.exit(1);
}

if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
  console.error('Plan must have a non-empty steps[] array');
  process.exit(1);
}

console.log(`Plan: "${plan.title ?? 'untitled'}"`);
console.log(`Steps: ${plan.steps.length}`);
console.log(`Ref:   ${REF}`);
console.log();

async function post(route, body) {
  const res = await fetch(`${BASE}/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`/api/${route} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

function elapsed(t0) {
  return ((Date.now() - t0) / 1000).toFixed(1);
}

async function processStep(step, idx) {
  const stepNum = idx + 1;
  const tag = `[${String(stepNum).padStart(2, ' ')}]`;
  const start_t = Date.now();

  const start = await post('render-keyframe', {
    step_number: stepNum,
    kind: 'start',
    reference_url: REF,
    prompt: step.visual_prompt_start,
    quality: 'medium',
    image_size: 'landscape_16_9',
  });
  console.log(`${tag} start KF  (+${elapsed(start_t)}s)`);

  const end_t = Date.now();
  const end = await post('render-keyframe', {
    step_number: stepNum,
    kind: 'end',
    reference_url: start.url,
    prompt: step.visual_prompt_end,
    quality: 'medium',
    image_size: 'landscape_16_9',
  });
  console.log(`${tag} end KF    (+${elapsed(end_t)}s)`);

  const animate_t = Date.now();
  const [video, audio] = await Promise.all([
    post('animate-step', {
      step_number: stepNum,
      start_frame_url: start.url,
      end_frame_url: end.url,
      motion_prompt: step.motion_prompt,
      duration_seconds: step.duration_seconds ?? 5,
      resolution: '720p',
    }),
    post('narrate', {
      step_number: stepNum,
      text_fr: step.narration,
    }),
  ]);
  console.log(`${tag} anim+narr (+${elapsed(animate_t)}s)  total step=${elapsed(start_t)}s`);

  return {
    step_number: stepNum,
    video_url: video.url,
    audio_url: audio.url,
    subtitle_fr: step.subtitle,
  };
}

const tTotal = Date.now();
console.log('Generating all steps in parallel…\n');

let clips;
try {
  clips = await Promise.all(plan.steps.map((step, idx) => processStep(step, idx)));
} catch (err) {
  console.error('\nStep generation failed:', err.message);
  process.exit(2);
}

console.log(`\nAll ${plan.steps.length} steps generated in ${elapsed(tTotal)}s`);

console.log('\nStitching all clips…');
const tStitch = Date.now();
const final = await post('stitch', { clips });
console.log(`Stitch done (+${elapsed(tStitch)}s)`);

console.log('\n=== FINAL ===');
console.log(`Duration: ${final.duration_seconds.toFixed(1)}s`);
console.log(`URL:      ${final.url}`);
console.log(`Total:    ${elapsed(tTotal)}s`);

if (process.platform === 'darwin') {
  spawn('open', [final.url], { detached: true, stdio: 'ignore' }).unref();
}
