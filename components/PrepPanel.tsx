'use client';

import type { RepairPlan } from '@/lib/types';

/**
 * Pre-repair prep panel displayed under the photo as soon as the plan arrives,
 * BEFORE the user taps the marker to watch the tutorial.
 *
 * Shows:
 *   1. The main replacement part to order (with Buy link from Tavily enrichment)
 *   2. The full tools list (required vs optional)
 *   3. Global safety warnings (safety_pre_check)
 *
 * Quiet by design: hidden until the plan is known. Stays visible during and
 * after the chapter player session so the user can return to it.
 */
export function PrepPanel({ plan }: { plan: RepairPlan }) {
  const primaryPart = plan.parts_summary?.[0];
  const otherParts = (plan.parts_summary ?? []).slice(1);
  const tools = plan.tools_summary ?? [];
  const safety = plan.safety_pre_check ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border)] bg-white p-4 text-sm animate-[fade-in_300ms_ease-out]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-fg)]">Before you start</h2>
        <span className="text-xs text-[color:var(--color-muted)]">
          {plan.difficulty} · ~{plan.total_duration_min} min
        </span>
      </div>

      {safety.length > 0 ? (
        <div className="rounded-md border border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn)]/5 px-3 py-2 text-xs">
          <p className="font-semibold uppercase tracking-wide text-[color:var(--color-warn)]">
            ⚠ Safety
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[color:var(--color-fg)]">
            {safety.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {primaryPart ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-subtle)]">
            Part to replace
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
            <span className="flex-1 text-[color:var(--color-fg)]">
              <span className="font-medium">
                {primaryPart.quantity}× {primaryPart.name}
              </span>
              {primaryPart.specification ? (
                <span className="text-[color:var(--color-muted)]">
                  {' '}
                  — {primaryPart.specification}
                </span>
              ) : null}
            </span>
            {primaryPart.purchase_url ? (
              <a
                href={primaryPart.purchase_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--color-accent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-[color:var(--color-accent-hover)]"
              >
                Buy
                <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
          {otherParts.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[color:var(--color-muted)]">
              {otherParts.map((p) => (
                <li key={p.name}>
                  + {p.quantity}× {p.name}
                  {p.specification ? ` — ${p.specification}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-subtle)]">
            Tools to prepare
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-[color:var(--color-fg)]">
            {tools.map((t) => (
              <li key={t.name}>
                • {t.name}
                {t.required ? (
                  ''
                ) : (
                  <span className="text-[color:var(--color-muted)]"> (optional)</span>
                )}
                {t.specification ? (
                  <span className="text-[color:var(--color-muted)]"> — {t.specification}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
