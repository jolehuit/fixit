#!/usr/bin/env node
// Upload a local image to fal's CDN and print the public URL.
// fal needs a publicly reachable URL for the reference image — localhost won't
// do. This helper gives you one in 2 seconds.
//
// Usage:
//   node --env-file=.env.local scripts/upload-image.mjs public/demos/flat-tire/input.png
//
// Output: a single URL on stdout, errors on stderr. Easy to capture:
//   REF=$(node --env-file=.env.local scripts/upload-image.mjs ./my-bike.jpg)
//   ./scripts/test-pipeline.sh

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { fal } from '@fal-ai/client';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node --env-file=.env.local scripts/upload-image.mjs <path-to-image>');
  process.exit(1);
}

const apiKey = process.env.FAL_KEY;
if (!apiKey) {
  console.error('FAL_KEY missing. Use --env-file=.env.local or export FAL_KEY.');
  process.exit(1);
}

fal.config({ credentials: apiKey });

const mime =
  {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }[extname(arg).toLowerCase()] ?? 'application/octet-stream';

const buf = readFileSync(arg);
const file = new File([buf], basename(arg), { type: mime });

try {
  const url = await fal.storage.upload(file);
  console.log(url);
} catch (err) {
  console.error('fal.storage.upload failed:', err);
  process.exit(2);
}
