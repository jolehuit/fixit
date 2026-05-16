'use client';

import { useEffect, useRef } from 'react';
import { type Chapter, ChapterPlayer } from './ChapterPlayer';

export function ChapterPlayerModal({
  chapters,
  title,
  onClose,
}: {
  chapters: Chapter[];
  title?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-0 z-50 flex animate-[fade-in_180ms_ease-out] items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Interactive repair tutorial'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={closeRef} tabIndex={-1} className="w-full max-w-5xl outline-none">
        {/* tabIndex=-1 keeps focus inside the modal for Escape handling */}
        <ChapterPlayer chapters={chapters} onClose={onClose} />
      </div>
    </div>
  );
}
