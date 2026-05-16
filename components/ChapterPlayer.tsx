'use client';

import { useEffect, useRef, useState } from 'react';

export type Chapter = {
  step_number: number;
  title: string;
  subtitle: string;
  description: string;
  video_url: string;
  audio_url: string;
  safety_note?: string;
  success_criteria?: string;
  common_mistake?: string;
};

export type ChapterPlayerProps = {
  chapters: Chapter[];
  startAt?: number;
  onClose?: () => void;
};

/**
 * YouTube-style chapter player with a critical difference: chapters do NOT
 * auto-advance. The video loops on each step until the user clicks the next
 * chapter — turning the video into an interactive tutorial where each step
 * is a beat the user controls.
 */
export function ChapterPlayer({ chapters, startAt = 0, onClose }: ChapterPlayerProps) {
  const safeStart = Math.min(Math.max(0, startAt), chapters.length - 1);
  const [currentIndex, setCurrentIndex] = useState(safeStart);
  const [audioEnded, setAudioEnded] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  // Track which chapters have been visited so the timeline shows completion.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([safeStart]));

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const current = chapters[currentIndex];
  const isLast = currentIndex === chapters.length - 1;
  const nextChapter = !isLast ? chapters[currentIndex + 1] : null;

  // Reset transient per-chapter state when the chapter changes. The <video>
  // and <audio> are re-keyed below so the browser refetches the new sources;
  // we just need to reset our local "audio ended" / progress trackers.
  useEffect(() => {
    setAudioEnded(false);
    setAudioProgress(0);
    setAudioDuration(0);
    setSeen((s) => {
      if (s.has(currentIndex)) return s;
      const next = new Set(s);
      next.add(currentIndex);
      return next;
    });
  }, [currentIndex]);

  // Try to autoplay the narration. If the browser blocks it (Safari without a
  // prior user gesture), surface an unmute affordance so the user can tap.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = false;
    setAudioMuted(false);
    const promise = a.play();
    if (promise && typeof promise.then === 'function') {
      promise.catch(() => {
        a.muted = true;
        setAudioMuted(true);
        a.play().catch(() => {});
      });
    }
  }, []);

  const unmute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = false;
    setAudioMuted(false);
    a.play().catch(() => {});
  };

  const goTo = (index: number) => {
    if (index === currentIndex) return;
    const clamped = Math.min(Math.max(0, index), chapters.length - 1);
    setCurrentIndex(clamped);
  };

  const replayChapter = () => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (a) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setAudioEnded(false);
  };

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 text-white">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Step {currentIndex + 1} of {chapters.length}
          </span>
          <span className="truncate text-base font-semibold sm:text-lg">{current.title}</span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tutorial"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      {/* Video stage */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
        <video
          key={`video-${current.step_number}`}
          ref={videoRef}
          src={current.video_url}
          autoPlay
          muted
          loop
          playsInline
          className="block w-full"
        />
        <audio
          key={`audio-${current.step_number}`}
          ref={audioRef}
          src={current.audio_url}
          autoPlay
          preload="auto"
          onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setAudioProgress(e.currentTarget.currentTime || 0)}
          onEnded={() => setAudioEnded(true)}
        >
          <track kind="captions" />
        </audio>

        {/* Burned-in style subtitle overlay */}
        {current.subtitle ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <span className="max-w-2xl rounded-md bg-black/65 px-3 py-1.5 text-center text-sm font-medium text-white shadow-lg sm:text-base">
              {current.subtitle}
            </span>
          </div>
        ) : null}

        {/* "Step complete" affordance — appears once audio finishes */}
        {audioEnded ? (
          <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow-md">
            <span aria-hidden>✓</span>
            <span>Step complete{nextChapter ? ' · tap next when ready' : ' · all done'}</span>
          </div>
        ) : null}

        {/* Looping badge */}
        {audioEnded ? (
          <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/85">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Looping
          </div>
        ) : null}

        {audioMuted ? (
          <button
            type="button"
            onClick={unmute}
            className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/95"
          >
            <SpeakerIcon /> Unmute narration
          </button>
        ) : null}
      </div>

      {/* Chapter timeline (YouTube-style segmented bar) */}
      <ChapterTimeline
        chapters={chapters}
        currentIndex={currentIndex}
        audioProgress={audioProgress}
        audioDuration={audioDuration}
        seen={seen}
        onSelect={goTo}
      />

      {/* Step body + advance controls */}
      <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4 text-white">
        <p className="text-sm leading-relaxed text-white/90">{current.description}</p>

        {(current.safety_note || current.success_criteria || current.common_mistake) && (
          <div className="grid gap-1.5 text-xs sm:grid-cols-3">
            {current.safety_note ? (
              <div className="rounded-md bg-amber-500/20 px-2.5 py-1.5 text-amber-100">
                <span className="font-semibold">⚠ Safety</span>
                <p className="mt-0.5 text-amber-50/90">{current.safety_note}</p>
              </div>
            ) : null}
            {current.success_criteria ? (
              <div className="rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-emerald-100">
                <span className="font-semibold">✓ Done when</span>
                <p className="mt-0.5 text-emerald-50/90">{current.success_criteria}</p>
              </div>
            ) : null}
            {current.common_mistake ? (
              <div className="rounded-md bg-rose-500/20 px-2.5 py-1.5 text-rose-100">
                <span className="font-semibold">✗ Avoid</span>
                <p className="mt-0.5 text-rose-50/90">{current.common_mistake}</p>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={replayChapter}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
            >
              ↻ Replay step
            </button>
          </div>

          {nextChapter ? (
            <button
              type="button"
              onClick={() => goTo(currentIndex + 1)}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                audioEnded
                  ? 'animate-[next-pulse_1.6s_ease-in-out_infinite] bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-hover)]'
                  : 'bg-white/15 hover:bg-white/25'
              }`}
            >
              Next: {nextChapter.title}
              <span aria-hidden>→</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(0)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
            >
              ↺ Restart tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterTimeline({
  chapters,
  currentIndex,
  audioProgress,
  audioDuration,
  seen,
  onSelect,
}: {
  chapters: Chapter[];
  currentIndex: number;
  audioProgress: number;
  audioDuration: number;
  seen: Set<number>;
  onSelect: (i: number) => void;
}) {
  // Equal-width segments — narration durations vary too much to make
  // proportional widths readable for short (~15s) clips.
  const progressInCurrent = audioDuration > 0 ? Math.min(1, audioProgress / audioDuration) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex w-full items-stretch gap-[3px]">
        {chapters.map((c, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex || (seen.has(i) && !isActive);
          const fill = isActive ? progressInCurrent : isPast ? 1 : 0;
          return (
            <button
              key={c.step_number}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Jump to step ${c.step_number}: ${c.title}`}
              title={`${c.step_number}. ${c.title}`}
              className="group relative flex-1 cursor-pointer"
            >
              <div
                className={`relative h-1.5 overflow-hidden rounded-full transition ${
                  isActive ? 'bg-white/25' : 'bg-white/15 group-hover:bg-white/25'
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-200 ${
                    isActive
                      ? 'bg-[color:var(--color-accent)]'
                      : isPast
                        ? 'bg-white/70'
                        : 'bg-transparent'
                  }`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
              {/* Hover tooltip */}
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                {c.step_number}. {c.title}
              </span>
            </button>
          );
        })}
      </div>
      <div className="hidden grid-flow-col text-[10px] text-white/55 sm:grid">
        {chapters.map((c, i) => (
          <button
            key={c.step_number}
            type="button"
            onClick={() => onSelect(i)}
            className={`truncate px-1 text-left transition hover:text-white ${
              i === currentIndex ? 'font-semibold text-white' : ''
            }`}
          >
            {c.step_number}. {c.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <title>Close</title>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Sound</title>
      <path d="M3 6h2l3.5-3v10L5 10H3V6Z" />
      <path d="M11 6.5c.7.5 1 1.2 1 1.9s-.3 1.4-1 1.9" />
    </svg>
  );
}
