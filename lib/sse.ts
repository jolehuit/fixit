/**
 * SSE serialization helpers.
 *
 * StreamEvent → bytes the browser's EventSource (or fetch+streaming reader)
 * can parse. We use one `data: <json>\n\n` chunk per event, no custom
 * event names — the discriminated union's `type` field handles dispatch
 * on the client.
 */

import type { StreamEvent } from './types';

const encoder = new TextEncoder();

export function encodeEvent(ev: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);
}

/** Heartbeat lines keep proxies from buffering or closing the stream. */
export function encodeHeartbeat(): Uint8Array {
  return encoder.encode(`: heartbeat ${Date.now()}\n\n`);
}

export const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Disable Nginx buffering on Vercel proxies
  'X-Accel-Buffering': 'no',
};
