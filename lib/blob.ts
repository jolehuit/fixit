/**
 * Vercel Blob upload helpers.
 *
 * Used by Role C (narration audio, final video) and Role D (intermediate
 * assets that don't already come back as a public URL).
 *
 * fal.ai responses already include public CDN URLs for images/videos, so
 * we don't need to re-upload those by default.
 *
 * Dev fallback: when BLOB_READ_WRITE_TOKEN is unset (and NODE_ENV !==
 * 'production'), writes to public/_local-blob/<pathname> and returns
 * http://localhost:3000/_local-blob/<pathname>. Production deploys must
 * have the token set or upload() throws.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type PutBlobResult, put } from '@vercel/blob';
import { env } from './env';

export type UploadOptions = {
  pathname: string;
  body: ArrayBuffer | Buffer | Blob | ReadableStream | string;
  contentType?: string;
  cacheMaxAge?: number;
};

export async function upload(opts: UploadOptions): Promise<PutBlobResult> {
  if (env.BLOB_READ_WRITE_TOKEN) {
    return put(opts.pathname, opts.body as Parameters<typeof put>[1], {
      access: 'public',
      contentType: opts.contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: opts.cacheMaxAge ?? 60 * 60 * 24 * 30, // 30 days
      token: env.BLOB_READ_WRITE_TOKEN,
    });
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('BLOB_READ_WRITE_TOKEN is required in production.');
  }
  return uploadLocal(opts);
}

async function uploadLocal(opts: UploadOptions): Promise<PutBlobResult> {
  const root = path.join(process.cwd(), 'public', '_local-blob');
  const dest = path.join(root, opts.pathname);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await toBuffer(opts.body));
  const baseUrl = process.env.NEXT_PUBLIC_DEV_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/_local-blob/${opts.pathname}`;
  return {
    url,
    downloadUrl: url,
    pathname: opts.pathname,
    contentType: opts.contentType ?? 'application/octet-stream',
    contentDisposition: `inline; filename="${path.basename(opts.pathname)}"`,
    etag: `"local-${Date.now()}"`,
  };
}

async function toBuffer(
  body: ArrayBuffer | Buffer | Blob | ReadableStream | string,
): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function blobKey(jobId: string, kind: string, ext: string): string {
  return `jobs/${jobId}/${kind}.${ext}`;
}
