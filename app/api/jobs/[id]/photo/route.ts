/**
 * GET /api/jobs/:id/photo
 *
 * Returns the input photo for a job as raw image bytes (`Content-Type` from the
 * data URL prefix). The orchestrator stores the data URL in lib/jobs at job
 * creation; this route decodes it on demand.
 *
 * 404 if the job is unknown or no photo was attached.
 */

import { getPhoto, hasJob } from '@/lib/jobs';

export const runtime = 'nodejs';

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params;
  if (!hasJob(jobId)) {
    return new Response(JSON.stringify({ error: 'unknown_job' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const dataUrl = getPhoto(jobId);
  if (!dataUrl) {
    return new Response(JSON.stringify({ error: 'no_photo' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) {
    return new Response(JSON.stringify({ error: 'malformed_photo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, 'base64');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime || 'image/png',
      // Keep memory-stored photo cacheable for the browser session.
      'Cache-Control': 'private, max-age=600',
    },
  });
}
