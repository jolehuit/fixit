'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import type { Chapter } from '@/components/ChapterPlayer';
import { ChapterPlayerModal } from '@/components/ChapterPlayerModal';
import { LiveProgress } from '@/components/LiveProgress';
import { PrepPanel } from '@/components/PrepPanel';
import { VideoModal } from '@/components/VideoModal';
import { demos } from '@/lib/demos';
import { type AnalyzeResult, type DefectMarker, DemoId, type RepairPlan } from '@/lib/types';

function JobInner({ jobId }: { jobId: string }) {
  const search = useSearchParams();
  const demoParam = search.get('demo');
  const demoIdMatch = DemoId.safeParse(demoParam);
  // When the job was started from a demo card, we know which pre-shot demo
  // this is — we use it to surface the title and the marker overlay on the
  // photo. For free uploads (no `?demo=…`), neither title nor marker apply.
  const demo = demoIdMatch.success ? demos[demoIdMatch.data] : null;

  const [imageFailed, setImageFailed] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [analyzeMarker, setAnalyzeMarker] = useState<DefectMarker | null>(null);

  const onAnalyze = (a: AnalyzeResult) => {
    if (a.defect_marker) setAnalyzeMarker(a.defect_marker);
  };

  // The photo is stored server-side at job creation. We just point <img> at
  // the streaming endpoint — no client-side storage quota to worry about.
  // Demo fallback only kicks in if the server can't serve the photo.
  const imgSrc = imageFailed ? (demo?.photo_url ?? null) : `/api/jobs/${jobId}/photo`;
  // Marker appears as soon as analyze has located the defect — even if the
  // tutorial isn't generated yet (skip mode). Click is gated to chapters/video.
  const analyzeRan = Boolean(analyzeMarker) || Boolean(plan);
  const headline = demo ? demo.title : 'Diagnosing your repair';
  const metaLine = demo ? demo.category : 'Live pipeline · Your photo';

  // Marker resolution: AI-detected (live) takes precedence over demo's static one.
  const marker = analyzeMarker ?? demo?.marker ?? null;
  const scanning = !analyzeRan && !imageFailed && Boolean(imgSrc);

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-3 text-sm text-[color:var(--color-muted)]">
            <span className="font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
              {metaLine}
            </span>
          </div>
          <h1 className="text-balance text-2xl font-bold leading-tight sm:text-3xl">{headline}</h1>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {!imgSrc || imageFailed ? (
              <div className="flex h-full w-full items-center justify-center px-4 text-center">
                {demo ? (
                  <span aria-hidden className="text-8xl opacity-70">
                    {demo.emoji}
                  </span>
                ) : (
                  <span className="text-sm text-[color:var(--color-muted)]">
                    Photo preview unavailable (session reset).
                  </span>
                )}
              </div>
            ) : (
              // biome-ignore lint/performance/noImgElement: native img + onError fallback
              <img
                src={imgSrc}
                alt={demo?.short ?? 'Uploaded for diagnosis'}
                onError={() => setImageFailed(true)}
                className="h-full w-full object-cover"
              />
            )}
            {scanning ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                <div
                  className="absolute inset-0 animate-[scan-tint_2.4s_ease-in-out_infinite]"
                  style={{
                    background:
                      'linear-gradient(to bottom, rgba(124,179,66,0) 0%, rgba(124,179,66,0.08) 50%, rgba(124,179,66,0) 100%)',
                  }}
                />
                <div
                  className="absolute inset-x-0 h-16 -translate-y-1/2 animate-[scan-ray_2.4s_ease-in-out_infinite]"
                  style={{
                    background:
                      'linear-gradient(to bottom, rgba(124,179,66,0) 0%, rgba(124,179,66,0.55) 50%, rgba(124,179,66,0) 100%)',
                    boxShadow:
                      '0 0 24px 6px rgba(124,179,66,0.35), 0 0 64px 12px rgba(124,179,66,0.18)',
                  }}
                />
                <div
                  className="absolute inset-x-0 h-px"
                  style={{
                    top: 0,
                    background:
                      'linear-gradient(to right, rgba(124,179,66,0) 0%, rgba(124,179,66,0.9) 50%, rgba(124,179,66,0) 100%)',
                    animation: 'scan-ray 2.4s ease-in-out infinite',
                    boxShadow: '0 0 10px 2px rgba(124,179,66,0.8)',
                  }}
                />
              </div>
            ) : null}
            {analyzeRan && !imageFailed && marker
              ? (() => {
                  const canPlay = Boolean(chapters) || Boolean(videoUrl);
                  const tooltipText = canPlay
                    ? `${marker.label} · ${chapters ? 'tap to start tutorial' : 'tap to watch'}`
                    : `${marker.label} · video coming soon…`;
                  const ariaLabel = canPlay
                    ? chapters
                      ? `Start interactive tutorial: ${marker.label}`
                      : `Watch repair video: ${marker.label}`
                    : `${marker.label} — video not ready yet`;
                  return (
                    <button
                      type="button"
                      onClick={() => canPlay && setModalOpen(true)}
                      disabled={!canPlay}
                      aria-label={ariaLabel}
                      className={`group absolute -translate-x-1/2 -translate-y-1/2 animate-[fade-in_400ms_ease-out] ${
                        canPlay ? 'cursor-pointer' : 'cursor-not-allowed'
                      }`}
                      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                    >
                      <span
                        className={`relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-marker-strong)] text-white ring-[5px] ring-white animate-[marker-beat_1.3s_ease-in-out_infinite] transition ${
                          canPlay ? 'group-hover:scale-110' : 'opacity-75'
                        }`}
                        style={{
                          boxShadow:
                            '0 0 0 2px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(220, 38, 38, 0.85)',
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          role="img"
                          viewBox="0 0 12 12"
                          width="16"
                          height="16"
                          fill="white"
                        >
                          <title>Play</title>
                          <path d="M3 2l7 4-7 4V2z" />
                        </svg>
                      </span>
                      <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-md bg-[color:var(--color-marker-strong)] px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-md transition group-hover:opacity-100">
                        {tooltipText}
                      </span>
                    </button>
                  );
                })()
              : null}
          </div>
          <p className="text-sm text-[color:var(--color-muted)]">
            {analyzeRan && marker
              ? chapters
                ? `${marker.label} located. Tap the marker to start the step-by-step tutorial.`
                : videoUrl
                  ? `${marker.label} located. Tap the marker to play the repair video.`
                  : `${marker.label} located. The tutorial video is being prepared…`
              : scanning
                ? 'Scanning your photo to locate the defect…'
                : 'Your photo feeds the full live pipeline. Each stage appears on the right as it completes.'}
          </p>

          {plan ? <PrepPanel plan={plan} /> : null}
        </aside>

        <section className="min-h-0">
          <LiveProgress
            jobId={jobId}
            onAnalyze={onAnalyze}
            onPlan={setPlan}
            onVideoReady={setVideoUrl}
            onChaptersReady={setChapters}
          />
        </section>
      </div>

      {modalOpen && chapters ? (
        <ChapterPlayerModal
          chapters={chapters}
          title={marker ? `Interactive repair · ${marker.label}` : 'Interactive repair tutorial'}
          onClose={() => setModalOpen(false)}
        />
      ) : modalOpen && videoUrl ? (
        <VideoModal
          url={videoUrl}
          title={marker ? `Repair · ${marker.label}` : 'Your repair video'}
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
