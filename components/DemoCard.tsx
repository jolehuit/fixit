'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type { DemoMeta } from '@/lib/demos';
import { demoLabels } from '@/lib/i18n';

export function DemoCard({ demo }: { demo: DemoMeta }) {
  const router = useRouter();
  const preloaded = useRef(false);
  const labels = demoLabels[demo.id];

  const preload = useCallback(() => {
    if (preloaded.current) return;
    preloaded.current = true;
    router.prefetch(`/demo/${demo.id}`);
  }, [demo.id, router]);

  const onClick = () => {
    router.push(`/demo/${demo.id}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={preload}
      onFocus={preload}
      onTouchStart={preload}
      className="group flex flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-white text-left transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
    >
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[color:var(--color-surface)]">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[color:var(--color-surface)] to-[color:var(--color-border)]/40" />
        <span aria-hidden className="relative text-7xl opacity-80 transition group-hover:scale-105">
          {demo.emoji}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
          {labels.category}
        </span>
        <h3 className="text-lg font-semibold text-[color:var(--color-fg)]">{labels.title}</h3>
        <div className="mt-1 flex items-center gap-4 text-sm text-[color:var(--color-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <Dot /> {labels.difficulty}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock /> {labels.estimatedTime}
          </span>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-accent)] transition group-hover:gap-2">
          Start guide
          <span aria-hidden>→</span>
        </span>
      </div>
    </button>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-accent)]"
    />
  );
}

function Clock() {
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
    >
      <title>Clock</title>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8l2.25 1.5" strokeLinecap="round" />
    </svg>
  );
}
