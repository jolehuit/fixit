/**
 * GET /api/stream/:jobId
 * Owner: Role D
 *
 * Server-Sent Events feed for a job. Subscribes to the in-memory channel
 * created by /api/run, replays buffered events, then streams live ones.
 *
 * Client side (Role A): use `EventSource('/api/stream/' + jobId)` or a
 * `fetch` + `ReadableStreamDefaultReader` to handle reconnects manually.
 */

import { hasJob, subscribe } from '@/lib/jobs';
import { encodeEvent, encodeHeartbeat, SSE_HEADERS } from '@/lib/sse';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  if (!hasJob(jobId)) {
    return new Response(JSON.stringify({ error: 'unknown_job' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribe(jobId, (ev) => {
        safeEnqueue(encodeEvent(ev));
        if (ev.type === 'done' || ev.type === 'error') {
          // small delay so the last frame flushes through proxies
          setTimeout(() => {
            if (!closed) {
              closed = true;
              try {
                controller.close();
              } catch {}
            }
          }, 250);
        }
      });

      const heartbeat = setInterval(() => safeEnqueue(encodeHeartbeat()), 15_000);

      // The runtime fires this when the client disconnects.
      const abort = () => {
        clearInterval(heartbeat);
        unsubscribe();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      };
      _req.signal.addEventListener('abort', abort);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
