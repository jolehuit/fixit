'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { ChatThread } from '@/components/ChatThread';
import { VideoModal } from '@/components/VideoModal';
import { demos } from '@/lib/demos';
import { demoLabels, problemMarker } from '@/lib/i18n';
import { DemoId } from '@/lib/types';

function JobInner({ jobId }: { jobId: string }) {
  const search = useSearchParams();
  const demoParam = search.get('demo');
  const parsed = DemoId.safeParse(demoParam);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!parsed.success) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-[color:var(--color-muted)]">Session expired. Pick a guide to start.</p>
        <Link
          href="/"
          className="rounded-md border border-[color:var(--color-border)] bg-white px-5 py-2 text-sm font-medium transition hover:border-[color:var(--color-border-strong)]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const demoId = parsed.data;
  const demo = demos[demoId];
  const labels = demoLabels[demoId];
  const marker = problemMarker[demoId];
  const ready = Boolean(videoUrl);

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-3 text-sm text-[color:var(--color-muted)]">
            <span className="font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
              {labels.category}
            </span>
            <span>·</span>
            <span>{labels.difficulty}</span>
            <span>·</span>
            <span>{labels.estimatedTime}</span>
          </div>
          <h1 className="text-balance text-2xl font-bold leading-tight sm:text-3xl">
            {labels.title}
          </h1>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {imageFailed ? (
              <div className="flex h-full w-full items-center justify-center">
                <span aria-hidden className="text-8xl opacity-70">
                  {demo.emoji}
                </span>
              </div>
            ) : (
              // biome-ignore lint/performance/noImgElement: native img keeps the onError fallback path simple
              <img
                src={demo.photo_url}
                alt={labels.short}
                onError={() => setImageFailed(true)}
                className="h-full w-full object-cover"
              />
            )}
            {ready && !imageFailed ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                aria-label={`Watch repair video — ${marker.label}`}
                className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer animate-[fade-in_400ms_ease-out]"
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-[ping-soft_1.8s_ease-out_infinite] rounded-full bg-[color:var(--color-accent)] opacity-70" />
                  <span className="absolute inline-flex h-full w-full animate-[ping-soft_1.8s_ease-out_0.6s_infinite] rounded-full bg-[color:var(--color-accent)] opacity-40" />
                  <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[color:var(--color-accent)] ring-2 ring-white shadow-md transition group-hover:scale-110">
                    <svg
                      aria-hidden="true"
                      role="img"
                      viewBox="0 0 12 12"
                      width="8"
                      height="8"
                      fill="white"
                    >
                      <title>Play</title>
                      <path d="M3 2l7 4-7 4V2z" />
                    </svg>
                  </span>
                </span>
                <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-md bg-[color:var(--color-fg)] px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition group-hover:opacity-100">
                  {marker.label} — tap to watch
                </span>
              </button>
            ) : null}
          </div>
          <p className="text-sm text-[color:var(--color-muted)]">
            {ready
              ? `${marker.label} located. Tap the marker to play the repair video.`
              : 'Your uploaded photo. The assistant uses it to identify the issue and pick the best repair procedure.'}
          </p>
        </aside>

        <section className="min-h-0">
          <ChatThread
            jobId={jobId}
            demoId={demoId}
            onVideoReady={setVideoUrl}
            onOpenVideo={() => setModalOpen(true)}
          />
        </section>
      </div>

      {modalOpen && videoUrl ? (
        <VideoModal
          url={videoUrl}
          title={`${labels.title} — ${marker.label}`}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  );
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-white/95 backdrop-blur">
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

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Suspense
          fallback={
            <div className="py-24 text-center text-[color:var(--color-muted)]">Loading…</div>
          }
        >
          <JobInner jobId={jobId} />
        </Suspense>
      </main>
    </div>
  );
}
