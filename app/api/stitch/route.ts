/**
 * POST /api/stitch
 * Owner: Role C
 *
 * Real ffmpeg pipeline (no mocks):
 *   1. Download each StitchClip's video + audio into a tmpdir.
 *   2. Probe each video for its true duration (so subtitle timing is exact).
 *   3. Build an aggregated SRT timed across the full concat'd timeline.
 *   4. Pass 1: ffmpeg filter_complex concats videos + per-segment audio into intermediate.mp4.
 *   5. Pass 2: ffmpeg burns the SRT onto intermediate.mp4 via the subtitles= filter.
 *   6. Upload final.mp4 to Vercel Blob, return FinalVideo.
 *
 * Why two passes (concat -> burn) instead of one filter graph:
 *   - Easier to debug: if concat fails we never get to subtitles; stderr is much smaller.
 *   - Mixing filter_complex (concat) with -vf (subtitles) requires routing subtitles
 *     INTO the filter_complex on [outv], which complicates the graph and pathing.
 *   - The intermediate file lives on tmpfs and is deleted in finally{}.
 *
 * Critical Vercel config (vercel.json):
 *   - memory: 2048, maxDuration: 300
 * Critical Next.js config (next.config.ts):
 *   - outputFileTracingIncludes pins the ffmpeg-static binary into the bundle.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { NextResponse } from 'next/server';
import { blobKey, upload } from '@/lib/blob';
import { FinalVideo, StitchRequest } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ---------- helpers ----------

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download_failed ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

/**
 * Probe a file's duration (seconds, float) by parsing `ffmpeg -i` stderr.
 * ffmpeg-static doesn't ship ffprobe, but `ffmpeg -i FILE` prints a
 * `Duration: HH:MM:SS.ms` line to stderr and exits non-zero with no -f null.
 * Adding `-f null -` makes it actually demux and exit 0 with full stats.
 */
function probeDurationSec(ffmpeg: string, file: string): number {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const stderr = `${out.stderr ?? ''}${out.stdout ?? ''}`;
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) {
    throw new Error(`probe_failed: no Duration line for ${file}\n${stderr.slice(-1000)}`);
  }
  const h = Number(m[1]);
  const mn = Number(m[2]);
  const s = Number(m[3]);
  const total = h * 3600 + mn * 60 + s;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`probe_failed: bad duration ${total} for ${file}`);
  }
  return total;
}

function fmtSrtTime(sec: number): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Split a French paragraph into reasonably-sized subtitle lines.
 * Strategy: first split on sentence boundaries (. ! ?), then any chunk
 * longer than ~12 words gets re-split on commas, then hard-wrapped to ~12 words.
 */
function splitSubtitle(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Split on sentence terminators, keeping reasonable chunks.
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts: string[] = [];
  for (const sent of sentences) {
    const words = sent.split(' ');
    if (words.length <= 12) {
      parts.push(sent);
      continue;
    }
    // Try comma split first.
    const commaChunks = sent
      .split(/,\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (commaChunks.length > 1 && commaChunks.every((c) => c.split(' ').length <= 14)) {
      parts.push(...commaChunks);
      continue;
    }
    // Hard wrap every 12 words.
    for (let i = 0; i < words.length; i += 12) {
      parts.push(words.slice(i, i + 12).join(' '));
    }
  }
  return parts;
}

/**
 * Build an SRT covering the entire concat timeline.
 * Each clip occupies [cumStart, cumStart + duration). Its subtitle lines are
 * evenly distributed across that window.
 */
function buildSrt(clips: { subtitle_fr: string }[], durations: number[]): string {
  const out: string[] = [];
  let cueIdx = 1;
  let cum = 0;
  for (let i = 0; i < clips.length; i++) {
    const dur = durations[i];
    const lines = splitSubtitle(clips[i].subtitle_fr);
    if (lines.length === 0) {
      cum += dur;
      continue;
    }
    const per = dur / lines.length;
    for (let j = 0; j < lines.length; j++) {
      const start = cum + j * per;
      const end = cum + (j + 1) * per;
      out.push(String(cueIdx++));
      out.push(`${fmtSrtTime(start)} --> ${fmtSrtTime(end)}`);
      out.push(lines[j]);
      out.push('');
    }
    cum += dur;
  }
  return out.join('\n');
}

function runFfmpeg(ffmpeg: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      // Tail-trim to last 16KB to bound memory.
      if (stderr.length > 16_384) stderr = stderr.slice(-16_384);
    });
    child.stdout.on('data', () => {
      /* drain */
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

// ---------- route ----------

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = StitchRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!ffmpegPath) {
    return NextResponse.json({ error: 'ffmpeg_binary_missing' }, { status: 500 });
  }
  const ffmpeg: string = ffmpegPath;

  // Stable order by step_number.
  const clips = [...parsed.data.clips].sort((a, b) => a.step_number - b.step_number);
  const n = clips.length;

  const work = mkdtempSync(join(tmpdir(), 'fixit-stitch-'));
  try {
    // 1. Download every video + audio in parallel.
    const videoPaths = clips.map((_, i) => join(work, `v${i}.mp4`));
    const audioPaths = clips.map((_, i) => join(work, `a${i}.wav`));

    await Promise.all([
      ...clips.map((c, i) => downloadToFile(c.video_url, videoPaths[i])),
      ...clips.map((c, i) => downloadToFile(c.audio_url, audioPaths[i])),
    ]);

    // 2. Probe per-video durations (synchronously — small, fast).
    const durations = videoPaths.map((p) => probeDurationSec(ffmpeg, p));

    // 3. Build SRT.
    const srt = buildSrt(clips, durations);
    const srtPath = join(work, 'subs.srt');
    writeFileSync(srtPath, srt, 'utf8');

    // 4. PASS 1: concat video[0..n) + audio[0..n) into intermediate.mp4.
    // filter_complex inputs: video files first (0..n-1), then audio files (n..2n-1).
    const inputArgs: string[] = [];
    for (const v of videoPaths) inputArgs.push('-i', v);
    for (const a of audioPaths) inputArgs.push('-i', a);

    // Build the concat filter graph.
    //   Video:  [0:v][1:v]...[n-1:v] concat=n=N:v=1:a=0 [outv]
    //   Audio:  per clip, MIX Seedance ambient ([i:a:0], 0.35) with TTS narration
    //           ([n+i:a:0], 1.0). amix duration=first → mix length = Seedance audio
    //           length (= video length), TTS clipped if longer. normalize=0 keeps
    //           our explicit volumes. aresample=48000 ensures both streams share
    //           a sample rate before mixing. Concat all [mix_i] → [outa].
    const vChain = Array.from({ length: n }, (_, i) => `[${i}:v:0]`).join('');
    const filterParts: string[] = [`${vChain}concat=n=${n}:v=1:a=0[outv]`];
    for (let i = 0; i < n; i++) {
      filterParts.push(`[${i}:a:0]aresample=48000,volume=0.35[bg${i}]`);
      filterParts.push(`[${n + i}:a:0]aresample=48000,volume=1.0[fg${i}]`);
      filterParts.push(
        `[bg${i}][fg${i}]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix${i}]`,
      );
    }
    const mixChain = Array.from({ length: n }, (_, i) => `[mix${i}]`).join('');
    filterParts.push(`${mixChain}concat=n=${n}:v=0:a=1[outa]`);
    const filterConcat = filterParts.join(';');

    const intermediate = join(work, 'intermediate.mp4');
    const concatArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputArgs,
      '-filter_complex',
      filterConcat,
      '-map',
      '[outv]',
      '-map',
      '[outa]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '24',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-y',
      intermediate,
    ];

    const concatRes = await runFfmpeg(ffmpeg, concatArgs);
    if (concatRes.code !== 0) {
      return NextResponse.json(
        {
          error: 'ffmpeg_concat_failed',
          code: concatRes.code,
          stderr: concatRes.stderr.slice(-2048),
        },
        { status: 500 },
      );
    }

    // 5. PASS 2: burn subs onto intermediate.
    // The subtitles= filter takes a path. ffmpeg has THREE escape levels in
    // a filtergraph string:
    //   (1) graph-level: ':' separates filter options, ',' separates filters
    //   (2) option-level: nothing special once inside the value
    //   (3) the filter itself parses its argument
    // To pass a path containing ':' or to embed an ASS force_style value
    // (which itself uses ',' between fields), we wrap both in single quotes,
    // and inside those quotes we escape commas/colons with '\'. Per ffmpeg
    // docs the safe pattern is: subtitles=PATH:force_style='K1=V1\,K2=V2'.
    // We choose a simpler robust path: \-escape commas in force_style only.
    const escapedSrt = srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    // ASS style fields, joined with literal backslash-comma so the graph
    // parser keeps them in one option value. Keep field names that ffmpeg's
    // libass actually honors (Fontsize, PrimaryColour, OutlineColour,
    // BorderStyle=3 = opaque box, MarginV, Alignment=2 = bottom-center).
    const forceStyle = [
      'Fontsize=20',
      'PrimaryColour=&H00FFFFFF',
      'OutlineColour=&H80000000',
      'BorderStyle=3',
      'Outline=1',
      'Shadow=0',
      'MarginV=40',
      'Alignment=2',
    ].join('\\,');

    const final = join(work, 'final.mp4');
    const burnArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      intermediate,
      '-vf',
      `subtitles=${escapedSrt}:force_style=${forceStyle}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-y',
      final,
    ];

    const burnRes = await runFfmpeg(ffmpeg, burnArgs);
    if (burnRes.code !== 0) {
      return NextResponse.json(
        {
          error: 'ffmpeg_subtitle_burn_failed',
          code: burnRes.code,
          stderr: burnRes.stderr.slice(-2048),
        },
        { status: 500 },
      );
    }

    // 6. Upload to Blob.
    const jobId = req.headers.get('x-job-id') ?? `stitch_${Date.now()}`;
    const body = readFileSync(final);
    const blob = await upload({
      pathname: blobKey(jobId, 'final', 'mp4'),
      body,
      contentType: 'video/mp4',
    });

    const totalDuration = durations.reduce((s, d) => s + d, 0);
    const result = FinalVideo.parse({
      url: blob.url,
      duration_seconds: totalDuration,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stitch] fatal', message);
    return NextResponse.json({ error: 'stitch_failed', message }, { status: 500 });
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch (e) {
      console.error('[stitch] cleanup failed', e);
    }
  }
}
