'use client';

/**
 * DemoCard — clickable tile that fires off /api/run with { demo_id }.
 * Owner: Role A (the visual treatment is intentionally minimal — design here).
 *
 * On click:
 *   - POST /api/run with { demo_id }
 *   - Navigate to /demo/[id] (Role A creates this page) carrying job_id
 *     so TerminalStream + VideoPlayer can pick it up.
 *
 * For now the click handler logs to the console so the route works at all.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { DemoMeta } from '@/lib/demos';
import type { RunResponse } from '@/lib/types';

export function DemoCard({ demo }: { demo: DemoMeta }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onClick = () => {
    start(async () => {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_id: demo.id }),
      });
      if (!res.ok) {
        console.error('run failed', await res.text().catch(() => ''));
        return;
      }
      const data = (await res.json()) as RunResponse;
      router.push(`/job/${data.job_id}`);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 text-left transition hover:border-[color:var(--color-accent)] disabled:opacity-50"
    >
      <span aria-hidden className="text-3xl">
        {demo.emoji}
      </span>
      <span className="text-base font-medium">{demo.title_fr}</span>
      <span className="text-xs text-[color:var(--color-muted)]">
        ~{demo.target_duration_seconds}s · cliquez pour lancer
      </span>
    </button>
  );
}
