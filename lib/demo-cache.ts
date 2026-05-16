/**
 * Demo cache pointer.
 *
 * Each demo card maps to a single manifest.json hosted on Vercel Blob,
 * containing the pre-baked analyze + plan + per-step video/audio URLs
 * (built by `scripts/build-demo-cache.mjs`). The URL is configured via
 * the env var `FIXIT_CACHE_<SLUG>_MANIFEST`. When unset, the demo falls
 * back to the live pipeline.
 *
 * Manifest shape: see DemoManifest in lib/types.ts.
 */

import type { DemoId } from './types';

function envSlug(demoId: DemoId): string {
  return demoId.toUpperCase().replace(/-/g, '_');
}

export function getDemoManifestUrl(demoId: DemoId): string {
  const slug = envSlug(demoId);
  return process.env[`FIXIT_CACHE_${slug}_MANIFEST`] ?? '';
}

/** True when a manifest URL is configured for this demo. */
export function isCachedDemo(demoId: DemoId): boolean {
  return Boolean(getDemoManifestUrl(demoId));
}
