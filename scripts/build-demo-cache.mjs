#!/usr/bin/env node
/**
 * Build a pre-baked manifest.json for one demo and upload it to Vercel Blob.
 *
 * For every step in the source plan.json the script:
 *   1. POST /api/render-keyframe (start)
 *   2. POST /api/render-keyframe (end, with prev_keyframe_url = start)
 *   3. In parallel: POST /api/animate-step  + POST /api/narrate
 *   4. Records {video_url, audio_url, duration_seconds, keyframes…}.
 *
 * After every step is done it uploads the analyze + plan + per-step URLs as
 * one manifest.json to Blob and prints the public URL + the env var name to
 * configure on Vercel (FIXIT_CACHE_<SLUG>_MANIFEST).
 *
 * Prerequisites:
 *   • `pnpm dev` running on http://localhost:3000 (Next.js routes must be up).
 *   • .env.local with FAL_KEY, BLOB_READ_WRITE_TOKEN, GRADIUM_API_KEY.
 *
 * Usage:
 *   node --env-file=.env.local scripts/build-demo-cache.mjs flat-tire
 *   node --env-file=.env.local scripts/build-demo-cache.mjs flat-tire \
 *     --photo public/demos/flat-tire/bike.png \
 *     --base-url http://localhost:3000
 */

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fal } from '@fal-ai/client';
import { put } from '@vercel/blob';
import { Agent, setGlobalDispatcher } from 'undici';

// Bump the default 5-min headers timeout — Seedance image-to-video routinely
// runs 4-8 min and crashes the script with UND_ERR_HEADERS_TIMEOUT otherwise.
setGlobalDispatcher(
  new Agent({ headersTimeout: 15 * 60_000, bodyTimeout: 15 * 60_000 }),
);

// ---------- args ----------
const args = process.argv.slice(2);
const demoId = args.find((a) => !a.startsWith('--'));
if (!demoId) {
  console.error('Usage: build-demo-cache.mjs <demo-id> [--photo path] [--base-url URL]');
  process.exit(1);
}
const getFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const KNOWN_DEMOS = {
  'flat-tire': 'public/demos/flat-tire/bike.png',
  'cracked-screen': 'public/demos/cracked-screen/phone.png',
  'dripping-faucet': 'public/demos/dripping-faucet/Fuite.png',
};

const baseUrl = (getFlag('--base-url', 'http://localhost:3000')).replace(/\/$/, '');
const photoPath = resolve(getFlag('--photo', KNOWN_DEMOS[demoId]));
const sourceDir = resolve(`scripts/demo-sources/${demoId}`);
const resumePath = getFlag('--resume', null);
const progressPath = getFlag('--progress-out', `/tmp/fixit-progress-${demoId}.json`);

// ---------- env (only required for real runs; --dry skips the API entirely) ----------
const FAL_KEY = process.env.FAL_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const IS_DRY = args.includes('--dry');
if (!IS_DRY) {
  if (!FAL_KEY) {
    console.error('FAL_KEY missing. Use --env-file=.env.local.');
    process.exit(1);
  }
  if (!BLOB_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN missing. Use --env-file=.env.local.');
    process.exit(1);
  }
  fal.config({ credentials: FAL_KEY });
}

// ---------- helpers ----------
const log = (msg) => console.log(`[cache:${demoId}] ${msg}`);
const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function check(res, label) {
  if (res.ok) return res.json();
  const text = await res.text().catch(() => '');
  throw new Error(`${label} → HTTP ${res.status}: ${text.slice(0, 400)}`);
}

async function post(path, body) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return check(res, `POST ${path}`);
}

/** Upload the local reference photo to fal's CDN so fal can fetch it. */
async function uploadPhotoToFal(path) {
  const buf = await readFile(path);
  const mime =
    {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    }[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const file = new File([buf], basename(path), { type: mime });
  return fal.storage.upload(file);
}

// ---------- pre-flight: cheap enum + shape checks ----------
const SHOT_TYPES = new Set(['wide', 'medium', 'close-up', 'macro']);
const CAMERA_MOVES = new Set([
  'static',
  'subtle_pan_left',
  'subtle_pan_right',
  'subtle_zoom_in',
  'subtle_zoom_out',
]);
const PACING = new Set(['slow_methodical', 'controlled', 'deliberate']);
const DIFFICULTY = new Set(['easy', 'medium', 'hard']);
const CATEGORY = new Set(['vehicle', 'electronics', 'plumbing', 'furniture', 'other']);

function preflight(analyze, plan) {
  const errs = [];
  if (!CATEGORY.has(analyze.category))
    errs.push(`analyze.category="${analyze.category}" not in ${[...CATEGORY].join('|')}`);
  if (!DIFFICULTY.has(plan.difficulty))
    errs.push(`plan.difficulty="${plan.difficulty}" not in ${[...DIFFICULTY].join('|')}`);
  if (plan.scene_lock) {
    if (!SHOT_TYPES.has(plan.scene_lock.shot_default))
      errs.push(
        `scene_lock.shot_default="${plan.scene_lock.shot_default}" not in ${[...SHOT_TYPES].join('|')}`,
      );
    if (!CAMERA_MOVES.has(plan.scene_lock.camera_default))
      errs.push(
        `scene_lock.camera_default="${plan.scene_lock.camera_default}" not in ${[...CAMERA_MOVES].join('|')}`,
      );
  }
  for (const s of plan.steps) {
    const ctx = `step ${s.step_number}`;
    if (s.shot_type && !SHOT_TYPES.has(s.shot_type))
      errs.push(`${ctx}.shot_type="${s.shot_type}" not in ${[...SHOT_TYPES].join('|')}`);
    if (s.camera_movement && !CAMERA_MOVES.has(s.camera_movement))
      errs.push(
        `${ctx}.camera_movement="${s.camera_movement}" not in ${[...CAMERA_MOVES].join('|')}`,
      );
    if (s.motion_pacing && !PACING.has(s.motion_pacing))
      errs.push(`${ctx}.motion_pacing="${s.motion_pacing}" not in ${[...PACING].join('|')}`);
    for (const req of [
      'visual_prompt_start',
      'visual_prompt_end',
      'motion_prompt',
      'narration',
      'title',
      'description',
    ]) {
      if (!s[req] || typeof s[req] !== 'string')
        errs.push(`${ctx}.${req} missing or not a string`);
    }
  }
  if (errs.length) {
    console.error('Pre-flight check failed:');
    for (const e of errs) console.error('  •', e);
    process.exit(3);
  }
}

async function probeDevServer() {
  try {
    const res = await fetch(`${baseUrl}/api/jobs/__healthcheck__/photo`, { method: 'GET' });
    // Any HTTP response means the server is up. 404 is expected for an
    // unknown job — what we want to detect is connection refused.
    return res.status >= 200 && res.status < 600;
  } catch {
    return false;
  }
}

// ---------- main ----------
(async () => {
  log(`source dir: ${sourceDir}`);
  const analyze = JSON.parse(await readFile(`${sourceDir}/analyze.json`, 'utf8'));
  const plan = JSON.parse(await readFile(`${sourceDir}/plan.json`, 'utf8'));

  preflight(analyze, plan);
  log(`pre-flight OK · ${plan.steps.length} steps · diff=${plan.difficulty}`);

  if (IS_DRY) {
    log('dry run — no API calls; exiting after pre-flight.');
    return;
  }

  if (!(await probeDevServer())) {
    console.error(
      `Cannot reach ${baseUrl}. Start the dev server first: \`env -u FAL_KEY pnpm dev\``,
    );
    process.exit(1);
  }

  log(`photo: ${photoPath}`);
  log(`base url: ${baseUrl}`);
  // Load resume state if any. Resume shape:
  //   { photo_url, steps: [{ step_number, keyframe_start_url, keyframe_end_url,
  //     video_url?, audio_url?, duration_seconds? }] }
  // A step is "complete" when it has BOTH video_url + audio_url. Otherwise we
  // generate what's missing (reusing keyframes when present).
  let resume = { photo_url: null, steps: [] };
  if (resumePath) {
    try {
      resume = JSON.parse(await readFile(resumePath, 'utf8'));
      log(`resuming from ${resumePath} (${resume.steps.length} known step(s))`);
    } catch (e) {
      console.error(`Failed to read --resume ${resumePath}: ${e.message}`);
      process.exit(4);
    }
  }
  const findResumeStep = (n) => resume.steps.find((s) => s.step_number === n);

  let photoUrl;
  if (resume.photo_url) {
    photoUrl = resume.photo_url;
    log(`photo URL (from resume): ${photoUrl}`);
  } else {
    log(`uploading reference photo to fal CDN…`);
    photoUrl = await uploadPhotoToFal(photoPath);
    log(`photo URL: ${photoUrl}`);
  }

  // Persist progress to disk after every step so a future crash can be resumed
  // with --resume pointing at this same file.
  const progress = { photo_url: photoUrl, steps: [] };
  async function persist() {
    await writeFile(progressPath, JSON.stringify(progress, null, 2));
  }

  let prevStartKeyframe;
  for (const step of plan.steps) {
    const stepStart = Date.now();
    log(`step ${step.step_number}/${plan.steps.length}: ${step.title}`);

    const cached = findResumeStep(step.step_number);
    const isComplete = cached?.video_url && cached?.audio_url;

    if (isComplete) {
      log(`  ↻ resuming — already complete, reusing URLs`);
      progress.steps.push({
        step_number: step.step_number,
        keyframe_start_url: cached.keyframe_start_url,
        keyframe_end_url: cached.keyframe_end_url,
        video_url: cached.video_url,
        audio_url: cached.audio_url,
        duration_seconds: cached.duration_seconds ?? 5,
      });
      prevStartKeyframe = cached.keyframe_end_url ?? prevStartKeyframe;
      await persist();
      log(`  step ${step.step_number} skipped in ${fmt(Date.now() - stepStart)}`);
      continue;
    }

    // 1. Start keyframe (reuse from resume if present)
    let kfStartUrl = cached?.keyframe_start_url;
    if (kfStartUrl) {
      log(`  ↻ render-keyframe start (reused): ${kfStartUrl}`);
    } else {
      log(`  → render-keyframe start…`);
      const kfStart = await post('/api/render-keyframe', {
        step_number: step.step_number,
        kind: 'start',
        reference_url: photoUrl,
        prev_keyframe_url: prevStartKeyframe,
        prompt: step.visual_prompt_start,
        quality: 'high',
        image_size: 'landscape_16_9',
        scene_lock: plan.scene_lock,
        subject_focus: step.subject_focus,
        shot_type: step.shot_type,
      });
      kfStartUrl = kfStart.url;
      log(`    ✓ ${kfStartUrl}`);
    }

    // 2. End keyframe (reuse from resume if present)
    let kfEndUrl = cached?.keyframe_end_url;
    if (kfEndUrl) {
      log(`  ↻ render-keyframe end (reused): ${kfEndUrl}`);
    } else {
      log(`  → render-keyframe end…`);
      const kfEnd = await post('/api/render-keyframe', {
        step_number: step.step_number,
        kind: 'end',
        reference_url: photoUrl,
        prev_keyframe_url: kfStartUrl,
        prompt: step.visual_prompt_end,
        quality: 'high',
        image_size: 'landscape_16_9',
        scene_lock: plan.scene_lock,
        subject_focus: step.subject_focus,
        shot_type: step.shot_type,
      });
      kfEndUrl = kfEnd.url;
      log(`    ✓ ${kfEndUrl}`);
    }
    prevStartKeyframe = kfEndUrl;

    // 3. Animate + narrate in parallel
    log(`  → animate-step + narrate (parallel)…`);
    const [anim, narr] = await Promise.all([
      post('/api/animate-step', {
        step_number: step.step_number,
        start_frame_url: kfStartUrl,
        end_frame_url: kfEndUrl,
        motion_prompt: step.motion_prompt,
        duration_seconds: 5,
        resolution: '720p',
        negative_cues: plan.scene_lock?.negative_cues,
        motion_pacing: step.motion_pacing,
        camera_movement: step.camera_movement ?? plan.scene_lock?.camera_default,
      }),
      post('/api/narrate', {
        step_number: step.step_number,
        text: step.narration,
        job_id: `cache_${demoId}`,
      }),
    ]);
    log(`    ✓ anim: ${anim.url}`);
    log(`    ✓ narr: ${narr.url} (${narr.duration_seconds}s)`);

    progress.steps.push({
      step_number: step.step_number,
      keyframe_start_url: kfStartUrl,
      keyframe_end_url: kfEndUrl,
      video_url: anim.url,
      audio_url: narr.url,
      duration_seconds: Math.max(narr.duration_seconds, anim.duration_seconds ?? 5),
    });
    await persist();

    log(`  step ${step.step_number} done in ${fmt(Date.now() - stepStart)}`);
  }
  const steps = progress.steps;

  // 4. Build + upload manifest
  const manifest = {
    demo_id: demoId,
    photo_url: photoUrl,
    generated_at: new Date().toISOString(),
    analyze,
    plan,
    steps,
  };

  log(`uploading manifest.json to Blob…`);
  const blob = await put(`cache/${demoId}/manifest.json`, JSON.stringify(manifest, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    token: BLOB_TOKEN,
  });

  const envVarName = `FIXIT_CACHE_${demoId.toUpperCase().replace(/-/g, '_')}_MANIFEST`;
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`✓ DONE — manifest uploaded`);
  console.log(`  URL : ${blob.url}`);
  console.log(`  ENV : ${envVarName}=${blob.url}`);
  console.log('────────────────────────────────────────────────────────────────\n');
})().catch((err) => {
  console.error('\n[cache:build] FATAL', err);
  process.exit(2);
});
