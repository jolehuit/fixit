/**
 * Manifest des URLs externes hand-crafted pour chaque démo cached.
 *
 * Tu héberges manuellement (typiquement sur Vercel Blob, public) :
 *   - <demo>/analyze.json   (AnalyzeResult parfait)
 *   - <demo>/plan.json      (RepairPlan parfait)
 *   - <demo>/output.mp4     (vidéo finale)
 *
 * Les URLs publiques sont lues depuis les env vars FIXIT_CACHE_<SLUG>_<TYPE>.
 * Si une URL manque → `isCachedDemo(...)` retourne `false` et `/api/run` tombe
 * en fallback live. Pas d'erreur fatale — le path live reste intact.
 *
 * Voir le plan : ~/.claude/plans/commnec-a-plainifier-l-implementationd-eager-lark.md
 */

import type { DemoId } from './types';

export type DemoCacheUrls = {
  analyzeUrl: string;
  planUrl: string;
  videoUrl: string;
};

/**
 * Lit les 3 URLs depuis l'env. Toutes vides par défaut → fallback live.
 *
 * Convention des var names :
 *   FIXIT_CACHE_FLAT_TIRE_ANALYZE / _PLAN / _VIDEO
 *   FIXIT_CACHE_CRACKED_SCREEN_ANALYZE / _PLAN / _VIDEO
 *   FIXIT_CACHE_DRIPPING_FAUCET_ANALYZE / _PLAN / _VIDEO
 */
function envSlug(demoId: DemoId): string {
  return demoId.toUpperCase().replace(/-/g, '_');
}

function readUrls(demoId: DemoId): DemoCacheUrls {
  const slug = envSlug(demoId);
  return {
    analyzeUrl: process.env[`FIXIT_CACHE_${slug}_ANALYZE`] ?? '',
    planUrl: process.env[`FIXIT_CACHE_${slug}_PLAN`] ?? '',
    videoUrl: process.env[`FIXIT_CACHE_${slug}_VIDEO`] ?? '',
  };
}

export function getDemoCacheUrls(demoId: DemoId): DemoCacheUrls {
  return readUrls(demoId);
}

/**
 * Une démo est considérée "cached" quand les 3 URLs sont posées.
 * Si une seule manque on retombe en live (plus simple que des fallbacks partiels).
 */
export function isCachedDemo(demoId: DemoId): boolean {
  const urls = readUrls(demoId);
  return Boolean(urls.analyzeUrl && urls.planUrl && urls.videoUrl);
}
