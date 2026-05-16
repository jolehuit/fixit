/**
 * Tavily wrapper.
 *
 * Role B uses this for /api/plan:
 *   - First try `/research` with `outputSchema` derived from RepairPlan.
 *   - If `/research` underperforms on FR queries, fall back to
 *     `/search` with include_domains then `/extract` on the top hit,
 *     then re-shape via gpt-5.5.
 */

import { tavily } from '@tavily/core';
import { env } from './env';

let _client: ReturnType<typeof tavily> | null = null;

export function tavilyClient() {
  if (!_client) {
    _client = tavily({ apiKey: env.TAVILY_API_KEY ?? '' });
  }
  return _client;
}

/** Domains we trust for FR repair content; used as a search-fallback filter. */
export const FR_REPAIR_DOMAINS = [
  'ifixit.com',
  'spareka.fr',
  'decathlon.fr',
  'manomano.fr',
  'leroymerlin.fr',
  'castorama.fr',
];
