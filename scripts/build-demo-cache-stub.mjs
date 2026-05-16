#!/usr/bin/env node
/**
 * Build a STUB DemoManifest for one (or all) demo(s) — no fal / Gradium /
 * keyframe generation. Every step is wired to the SAME placeholder MP4 +
 * silent WAV, so the chapter player can mount and the UI can be exercised
 * without firing the live pipeline.
 *
 * Use this to:
 *   - Bring up all 3 demos with a working cache while the real generation
 *     pipeline (`build-demo-cache.mjs`) is incomplete.
 *   - Iterate on the chapter player UI without burning fal credits.
 *
 * Once a demo has real per-step assets (via `build-demo-cache.mjs`),
 * re-upload its manifest from the real run — the stub URL becomes obsolete.
 *
 * Prerequisites:
 *   • BLOB_READ_WRITE_TOKEN in env.
 *   • A 5-second placeholder MP4 + silent WAV on disk (defaults to
 *     /tmp/fixit-stub/stub-video.mp4 + stub-audio.wav).
 *
 * Usage:
 *   node --env-file=.env.local scripts/build-demo-cache-stub.mjs
 *   node --env-file=.env.local scripts/build-demo-cache-stub.mjs flat-tire
 *   node --env-file=.env.local scripts/build-demo-cache-stub.mjs \
 *     --stub-video /tmp/x.mp4 --stub-audio /tmp/x.wav
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { put } from '@vercel/blob';

const args = process.argv.slice(2);
const DEMOS = ['flat-tire', 'cracked-screen', 'dripping-faucet'];
const targets = args.filter((a) => !a.startsWith('--'));
const demoIds = targets.length > 0 ? targets : DEMOS;
const getFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const stubVideoPath = resolve(getFlag('--stub-video', '/tmp/fixit-stub/stub-video.mp4'));
const stubAudioPath = resolve(getFlag('--stub-audio', '/tmp/fixit-stub/stub-audio.wav'));

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN missing. Use --env-file=.env.local.');
  process.exit(1);
}

const log = (msg) => console.log(`[stub] ${msg}`);

// Known reference photos per demo (used as `photo_url` in the manifest).
const PHOTO_PATHS = {
  'flat-tire': 'public/demos/flat-tire/bike.png',
  'cracked-screen': 'public/demos/cracked-screen/phone.png',
  'dripping-faucet': 'public/demos/dripping-faucet/Fuite.png',
};

async function uploadOnce(pathname, body, contentType) {
  const blob = await put(pathname, body, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    token: BLOB_TOKEN,
  });
  return blob.url;
}

(async () => {
  log(`stub-video: ${stubVideoPath}`);
  log(`stub-audio: ${stubAudioPath}`);
  log(`targets: ${demoIds.join(', ')}`);

  // Upload the placeholder MP4 + WAV ONCE — same URL reused by every step.
  log('uploading placeholder video + audio to Blob…');
  const [videoBuf, audioBuf] = await Promise.all([
    readFile(stubVideoPath),
    readFile(stubAudioPath),
  ]);
  const [videoUrl, audioUrl] = await Promise.all([
    uploadOnce('cache/_stub/video.mp4', videoBuf, 'video/mp4'),
    uploadOnce('cache/_stub/audio.wav', audioBuf, 'audio/wav'),
  ]);
  log(`  video: ${videoUrl}`);
  log(`  audio: ${audioUrl}`);

  const envLines = [];
  for (const demoId of demoIds) {
    const sourceDir = resolve(`scripts/demo-sources/${demoId}`);
    let analyze, plan;
    try {
      analyze = JSON.parse(await readFile(`${sourceDir}/analyze.json`, 'utf8'));
      plan = JSON.parse(await readFile(`${sourceDir}/plan.json`, 'utf8'));
    } catch (e) {
      console.error(`Cannot read ${sourceDir}: ${e.message}`);
      process.exit(2);
    }

    const photoLocalPath = PHOTO_PATHS[demoId];
    // The photo URL must be public for the AnalyzeResult shown on the live
    // pipeline panel. For a stub we just point at the local /public/ asset
    // served by the same Next.js app at runtime — but that's not a valid
    // url for Zod's z.string().url(). Instead, upload a tiny copy of the
    // photo to Blob so the URL is fully qualified.
    let photoUrl;
    if (photoLocalPath) {
      try {
        const photoBuf = await readFile(photoLocalPath);
        const ext = photoLocalPath.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        photoUrl = await uploadOnce(
          `cache/${demoId}/photo.${ext}`,
          photoBuf,
          ext === 'png' ? 'image/png' : 'image/jpeg',
        );
      } catch (e) {
        console.error(`Cannot read demo photo at ${photoLocalPath}: ${e.message}`);
        process.exit(3);
      }
    } else {
      photoUrl = videoUrl; // fallback — any valid URL keeps Zod happy
    }

    const steps = plan.steps.map((s) => ({
      step_number: s.step_number,
      video_url: videoUrl,
      audio_url: audioUrl,
      duration_seconds: 5,
    }));

    const manifest = {
      demo_id: demoId,
      photo_url: photoUrl,
      generated_at: new Date().toISOString(),
      analyze,
      plan,
      steps,
    };

    log(`uploading manifest for ${demoId} (${plan.steps.length} steps, stub assets)…`);
    const manifestUrl = await uploadOnce(
      `cache/${demoId}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      'application/json',
    );
    const envVarName = `FIXIT_CACHE_${demoId.toUpperCase().replace(/-/g, '_')}_MANIFEST`;
    log(`  ${envVarName}=${manifestUrl}`);
    envLines.push(`${envVarName}=${manifestUrl}`);
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('✓ STUB manifests uploaded. Set these on .env.local + Vercel:');
  for (const l of envLines) console.log(`  ${l}`);
  console.log('────────────────────────────────────────────────────────────────\n');
})().catch((err) => {
  console.error('\n[stub:build] FATAL', err);
  process.exit(2);
});
