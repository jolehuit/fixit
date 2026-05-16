'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type { DemoMeta } from '@/lib/demos';

export function DemoCard({ demo }: { demo: DemoMeta }) {
  const router = useRouter();
  const preloaded = useRef(false);

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
      <div className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden bg-[color:var(--color-surface)]">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[color:var(--color-surface)] to-[color:var(--color-border)]/40" />
        <span aria-hidden className="relative text-6xl opacity-80 transition group-hover:scale-105">
          {demo.emoji}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
          {demo.category}
        </span>
        <h3 className="text-base font-semibold text-[color:var(--color-fg)]">{demo.title}</h3>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-accent)] transition group-hover:gap-2">
          Start guide
          <span aria-hidden>→</span>
        </span>
      </div>
    </button>
  );
}
