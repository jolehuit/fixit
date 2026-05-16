'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { RunResponse } from '@/lib/types';

type Phase = 'idle' | 'reading' | 'uploading' | 'error';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB safety cap for inline data URLs

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

export function PhotoUpload() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      if (!file.type.startsWith('image/')) {
        setPhase('error');
        setErrorMsg('Please pick an image file (PNG, JPG, WebP…).');
        return;
      }
      if (file.size > MAX_BYTES) {
        setPhase('error');
        setErrorMsg(`Image too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
        return;
      }

      setPhase('reading');
      let dataUrl: string;
      try {
        dataUrl = await readAsDataUrl(file);
      } catch (err) {
        setPhase('error');
        setErrorMsg(err instanceof Error ? err.message : 'Could not read the file.');
        return;
      }

      setPhase('uploading');
      try {
        const res = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_url: dataUrl }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`POST /api/run failed (${res.status}): ${text.slice(0, 200)}`);
        }
        const data = (await res.json()) as RunResponse;
        router.push(`/job/${data.job_id}?mode=live`);
      } catch (err) {
        setPhase('error');
        setErrorMsg(err instanceof Error ? err.message : 'Failed to start the pipeline.');
      }
    },
    [router],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const busy = phase === 'reading' || phase === 'uploading';

  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        disabled={busy}
        className={`group flex flex-1 flex-col overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70 ${
          dragActive
            ? 'border-[color:var(--color-accent)]'
            : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-strong)]'
        }`}
        aria-label="Upload a photo of the broken object"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onInputChange}
          className="sr-only"
          disabled={busy}
        />

        <div
          className={`relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden ${
            dragActive ? 'bg-[color:var(--color-bubble-user)]' : 'bg-[color:var(--color-surface)]'
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white via-[color:var(--color-surface)] to-[color:var(--color-border)]/40" />
          {!busy ? (
            <span className="relative transition group-hover:scale-105">
              <UploadIcon />
            </span>
          ) : (
            <span className="relative inline-flex items-end gap-1.5">
              <span className="h-2 w-2 animate-[dot_1.2s_ease-in-out_infinite] rounded-full bg-[color:var(--color-accent)]" />
              <span className="h-2 w-2 animate-[dot_1.2s_ease-in-out_-0.2s_infinite] rounded-full bg-[color:var(--color-accent)]" />
              <span className="h-2 w-2 animate-[dot_1.2s_ease-in-out_-0.4s_infinite] rounded-full bg-[color:var(--color-accent)]" />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
            Your photo
          </span>
          <h3 className="text-base font-semibold text-[color:var(--color-fg)]">Upload your own</h3>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-accent)] transition group-hover:gap-2">
            {busy ? (phase === 'reading' ? 'Reading…' : 'Starting…') : 'Choose a photo'}
            <span aria-hidden>→</span>
          </span>
        </div>
      </button>

      {phase === 'error' && errorMsg ? (
        <div className="rounded-md border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/5 px-4 py-3 text-sm text-[color:var(--color-danger)]">
          <strong className="font-semibold">Couldn't start the pipeline.</strong>
          <span className="ml-1">{errorMsg}</span>
        </div>
      ) : null}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 24 24"
      width="60"
      height="60"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[color:var(--color-accent)]"
    >
      <title>Upload</title>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
