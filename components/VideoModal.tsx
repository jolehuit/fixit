'use client';

import { useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';

export function VideoModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[fade-in_180ms_ease-out] items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Repair video'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="relative w-full max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-3 text-white">
          <span className="font-medium">{title ?? 'Repair video'}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-hidden rounded-xl bg-black">
          <VideoPlayer url={url} />
        </div>
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
