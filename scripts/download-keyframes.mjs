#!/usr/bin/env node
/**
 * Read a progress-out JSON produced by `build-demo-cache.mjs --keyframes-only`
 * (or `--resume`) and download every keyframe into a FLAT folder per demo,
 * naming each file after its step number + step title + kind:
 *
 *   <out-dir>/<demo-id>/step-<NN>-<slug>-start.png
 *   <out-dir>/<demo-id>/step-<NN>-<slug>-end.png
 *
 * Step titles are pulled from scripts/demo-sources/<demo-id>/plan.json.
 *
 * Usage:
 *   node scripts/download-keyframes.mjs flat-tire \
 *     --progress /tmp/fixit-progress-flat-tire-v2.json \
 *     --out ~/Downloads/fixit-keyframes
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const demoId = args.find((a) => !a.startsWith('--'));
if (!demoId) {
  console.error('Usage: download-keyframes.mjs <demo-id> --progress <path> [--out <dir>]');
  process.exit(1);
}
const getFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const progressPath = getFlag('--progress', `/tmp/fixit-progress-${demoId}.json`);
const outDir = resolve(getFlag('--out', `${homedir()}/Downloads/fixit-keyframes`));

const log = (msg) => console.log(`[dl:${demoId}] ${msg}`);

async function downloadOne(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download_failed ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

(async () => {
  log(`progress: ${progressPath}`);
  log(`out: ${outDir}`);

  const { readFile, rm } = await import('node:fs/promises');
  const progress = JSON.parse(await readFile(progressPath, 'utf8'));

  // Pull step titles from the source plan.json so file names are descriptive.
  let titles = new Map();
  try {
    const plan = JSON.parse(
      await readFile(resolve(`scripts/demo-sources/${demoId}/plan.json`), 'utf8'),
    );
    for (const s of plan.steps) titles.set(s.step_number, slugify(s.title));
  } catch {
    // ignore — falls back to step-NN without title
  }

  // Wipe the demo folder first so renames/removals don't leave stale files.
  const demoDir = `${outDir}/${demoId}`;
  await rm(demoDir, { recursive: true, force: true });
  await mkdir(demoDir, { recursive: true });

  let total = 0;
  let okCount = 0;
  for (const step of progress.steps) {
    const slug = titles.get(step.step_number) ?? '';
    const prefix = `step-${String(step.step_number).padStart(2, '0')}${slug ? `-${slug}` : ''}`;
    const todo = [];
    if (step.keyframe_start_url) todo.push([`${prefix}-start.png`, step.keyframe_start_url]);
    if (step.keyframe_end_url) todo.push([`${prefix}-end.png`, step.keyframe_end_url]);
    for (const [name, url] of todo) {
      total++;
      try {
        await downloadOne(url, `${demoDir}/${name}`);
        okCount++;
        log(`  ${name}: ✓`);
      } catch (e) {
        log(`  ${name}: ✗ ${e.message}`);
      }
    }
  }

  console.log(`\n✓ ${okCount}/${total} keyframes downloaded to:`);
  console.log(`  ${demoDir}/`);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(2);
});
