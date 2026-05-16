'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { demos } from '@/lib/demos';
import { DemoId, type RunResponse } from '@/lib/types';

type Phase = 'idle' | 'encoding' | 'starting' | 'error';

export default function DemoIntroPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [phase, setPhase] = useState<Phase>('idle');
  const [imageFailed, setImageFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const start = async () => {
    setErrorMsg(null);
    setPhase('encoding');
    try {
      const res = await fetch(demo.photo_url);
      if (!res.ok) throw new Error(`Could not load demo photo (${res.status})`);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Reader returned non-string'));
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });

      setPhase('starting');
      const runRes = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // demo_id hint lets /api/run skip the photo classifier and go straight
        // to the cached replay (when the cache env vars are configured).
        body: JSON.stringify({
          photo_url: dataUrl,
          transcript_fr: demo.transcript_fr,
          demo_id: demoId,
        }),
      });
      if (!runRes.ok) {
        const text = await runRes.text().catch(() => '');
        throw new Error(`POST /api/run failed (${runRes.status}): ${text.slice(0, 200)}`);
      }
      const data = (await runRes.json()) as RunResponse;
      router.push(`/job/${data.job_id}?mode=live&demo=${demoId}`);
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Could not start the pipeline.');
    }
  };

  const busy = phase === 'encoding' || phase === 'starting';

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.webp" alt="fixit" className="h-10 w-auto" />
          </Link>
          <Link
            href="/"
            className="text-sm text-[color:var(--color-muted)] transition hover:text-[color:var(--color-fg)]"
          >
            ← Back to guides
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
          {demo.category}
        </span>
        <h1 className="max-w-xl text-balance text-2xl font-bold leading-tight text-[color:var(--color-fg)] sm:text-3xl">
          {demo.title}
        </h1>

        <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          {imageFailed ? (
            <div className="flex h-full w-full items-center justify-center">
              <span aria-hidden className="text-7xl opacity-70">
                {demo.emoji}
              </span>
            </div>
          ) : (
            // biome-ignore lint/performance/noImgElement: native img keeps the onError fallback path simple
            <img
              src={demo.photo_url}
              alt={demo.short}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
          {busy ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 border-t border-[color:var(--color-border)] bg-white/95 p-3 text-sm backdrop-blur">
              <span className="inline-flex items-end gap-1">
                <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_infinite] rounded-full bg-[color:var(--color-accent)]" />
                <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.2s_infinite] rounded-full bg-[color:var(--color-accent)]" />
                <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.4s_infinite] rounded-full bg-[color:var(--color-accent)]" />
              </span>
              <span className="text-[color:var(--color-fg)]">
                {phase === 'encoding' ? 'Preparing photo' : 'Starting pipeline'}
              </span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[color:var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            'Starting…'
          ) : (
            <>
              Troubleshoot
              <span aria-hidden>→</span>
            </>
          )}
        </button>

        {phase === 'error' && errorMsg ? (
          <div className="w-full max-w-md rounded-md border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/5 px-4 py-3 text-sm text-[color:var(--color-danger)]">
            <strong className="font-semibold">Couldn't start the pipeline.</strong>
            <span className="ml-1">{errorMsg}</span>
          </div>
        ) : null}
      </main>
    </div>
  );
}
