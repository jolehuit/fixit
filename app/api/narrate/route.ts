/**
 * POST /api/narrate
 * Owner: Role C
 *
 * Calls Gradium TTS REST with the FR flagship voice. The raw audio bytes
 * are uploaded to Vercel Blob and the public URL is returned in NarrationAudio.
 */

import { NextResponse } from 'next/server';
import { blobKey, upload } from '@/lib/blob';
import { synthesize } from '@/lib/gradium';
import { NarrateRequest, NarrationAudio } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * Compute audio duration in seconds from a WAV buffer by parsing its
 * RIFF/fmt/data chunks. Falls back to a word-count heuristic on any failure
 * (e.g. non-PCM container or unexpected layout).
 */
function wavDurationSeconds(buf: Buffer, fallbackText: string): number {
  try {
    // RIFF header: 'RIFF' (4) + size (4) + 'WAVE' (4) = 12 bytes
    if (buf.length < 44) throw new Error('buffer too small');
    if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('missing RIFF');
    if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('missing WAVE');

    // fmt subchunk starts at offset 12. Per spec:
    //   offset 24 (LE u32): sampleRate
    //   offset 28 (LE u32): byteRate (sampleRate * channels * bitsPerSample/8)
    const byteRate = buf.readUInt32LE(28);
    if (!byteRate) throw new Error('invalid byteRate');

    // Find the 'data' subchunk by scanning from offset 36 forward.
    // Some encoders insert extra chunks (e.g. 'LIST', 'fact') before 'data'.
    let offset = 36;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }
    if (!dataSize) throw new Error('data chunk not found');

    const seconds = dataSize / byteRate;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('non-positive duration');
    return Math.round(seconds * 100) / 100;
  } catch {
    const words = fallbackText.trim().split(/\s+/).filter(Boolean).length;
    const heuristic = Math.max(0.1, words * 0.18);
    return Math.round(heuristic * 100) / 100;
  }
}

function isTransientTtsError(err: unknown): boolean {
  const msg = String(err);
  if (/\b(502|503)\b/.test(msg)) return true;
  // Node fetch network errors surface as TypeError / ECONNRESET / ETIMEDOUT / ENOTFOUND etc.
  if (err instanceof TypeError) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed/i.test(msg)) return true;
  return false;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = NarrateRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { step_number, text, voice_id, job_id } = parsed.data;

  // 1. Synthesize via Gradium (single retry on transient errors).
  let buf: Buffer;
  try {
    try {
      buf = await synthesize({ text: text, voice_id, output_format: 'wav' });
    } catch (err) {
      if (!isTransientTtsError(err)) throw err;
      buf = await synthesize({ text: text, voice_id, output_format: 'wav' });
    }
  } catch (err) {
    return NextResponse.json({ error: 'tts_failed', detail: String(err) }, { status: 502 });
  }

  // 2. Upload WAV bytes to Vercel Blob.
  const jobId = job_id ?? 'standalone';
  let blob;
  try {
    blob = await upload({
      pathname: blobKey(jobId, `narration_step${step_number}`, 'wav'),
      body: buf,
      contentType: 'audio/wav',
    });
  } catch (err) {
    return NextResponse.json({ error: 'blob_upload_failed', detail: String(err) }, { status: 502 });
  }

  // 3. Compute duration from WAV header (with heuristic fallback).
  const duration_seconds = wavDurationSeconds(buf, text);

  // 4. Return strictly-validated NarrationAudio.
  const result = NarrationAudio.parse({
    step_number,
    url: blob.url,
    duration_seconds,
  });
  return NextResponse.json(result);
}
