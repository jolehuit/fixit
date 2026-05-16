/**
 * Vercel Blob upload helpers.
 *
 * Used by Role C (narration audio, final video) and Role D (intermediate
 * assets that don't already come back as a public URL).
 *
 * fal.ai responses already include public CDN URLs for images/videos, so
 * we don't need to re-upload those by default.
 */

import { type PutBlobResult, put } from '@vercel/blob';
import { env } from './env';

export type UploadOptions = {
  pathname: string;
  body: ArrayBuffer | Buffer | Blob | ReadableStream | string;
  contentType?: string;
  cacheMaxAge?: number;
};

export async function upload(opts: UploadOptions): Promise<PutBlobResult> {
  return put(opts.pathname, opts.body as Parameters<typeof put>[1], {
    access: 'public',
    contentType: opts.contentType,
    addRandomSuffix: true,
    cacheControlMaxAge: opts.cacheMaxAge ?? 60 * 60 * 24 * 30, // 30 days
    token: env.BLOB_READ_WRITE_TOKEN,
  });
}

export function blobKey(jobId: string, kind: string, ext: string): string {
  return `jobs/${jobId}/${kind}.${ext}`;
}
