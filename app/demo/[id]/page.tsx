'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { demos } from '@/lib/demos';
import { demoLabels } from '@/lib/i18n';
import { DemoId, type RunResponse } from '@/lib/types';

export default function DemoIntroPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'starting'>('idle');
  const [imageFailed, setImageFailed] = useState(false);

  const parsed = DemoId.safeParse(id);
  if (!parsed.success) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 px-6 py-32 text-center">
          <p className="text-[color:var(--color-muted)]">Guide not found.</p>
          <Link
            href="/"
            className="rounded-md border border-[color:var(--color-border)] bg-white px-5 py-2 text-sm font-medium transition hover:border-[color:var(--color-border-strong)]"
          >
            Back to home
          </Link>
        </main>
      </div>
    );
  }
  const demoId = parsed.data;
  const demo = demos[demoId];
  const labels = demoLabels[demoId];

  const attach = async () => {
    setPhase('uploading');
    await new Promise((r) => setTimeout(r, 1300));
    setPhase('starting');

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_id: demoId }),
      });
      if (!res.ok) throw new Error('run failed');
      const data = (await res.json()) as RunResponse;
      router.push(`/job/${data.job_id}?demo=${demoId}`);
    } catch {
      setPhase('idle');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">fixit</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[color:var(--color-muted)] transition hover:text-[color:var(--color-fg)]"
          >
            ← Back to guides
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <div className="flex flex-col items-center gap-8 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
            {labels.category} · {labels.difficulty}
          </span>
          <h1 className="max-w-xl text-balance text-3xl font-bold leading-tight text-[color:var(--color-fg)] sm:text-4xl">
            {labels.title}
          </h1>
          <p className="max-w-lg text-[color:var(--color-muted)]">{labels.intro}</p>

          <div className="relative mt-2 aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {phase === 'idle' ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                <CameraIcon />
                <span className="text-sm text-[color:var(--color-muted)]">
                  A clear, well-lit photo works best
                </span>
              </div>
            ) : imageFailed ? (
              <div className="flex h-full w-full items-center justify-center">
                <span aria-hidden className="text-7xl opacity-70">
                  {demo.emoji}
                </span>
              </div>
            ) : (
              // biome-ignore lint/performance/noImgElement: native img keeps the onError fallback path simple
              <img
                src={demo.photo_url}
                alt={labels.short}
                onError={() => setImageFailed(true)}
                className="h-full w-full animate-[fade-in_400ms_ease-out] object-cover"
              />
            )}
            {phase !== 'idle' ? (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] bg-white/95 p-3 text-sm backdrop-blur">
                <span className="inline-flex items-end gap-1">
                  <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_infinite] rounded-full bg-[color:var(--color-accent)]" />
                  <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.2s_infinite] rounded-full bg-[color:var(--color-accent)]" />
                  <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.4s_infinite] rounded-full bg-[color:var(--color-accent)]" />
                </span>
                <span className="text-[color:var(--color-fg)]">
                  {phase === 'uploading' ? 'Uploading your photo' : 'Starting diagnosis'}
                </span>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={attach}
            disabled={phase !== 'idle'}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[color:var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === 'idle' ? (
              <>
                <CameraIcon small /> Attach a photo
              </>
            ) : (
              'Uploading…'
            )}
          </button>
          <p className="text-xs text-[color:var(--color-subtle)]">
            For this demo, we use a sample photo. Your photo would replace it in production.
          </p>
        </div>
      </main>
    </div>
  );
}

function CameraIcon({ small }: { small?: boolean }) {
  const size = small ? 18 : 36;
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={small ? '' : 'text-[color:var(--color-subtle)]'}
    >
      <title>Camera</title>
      <path d="M3 8.5a2 2 0 0 1 2-2h2l1.5-2h7L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
