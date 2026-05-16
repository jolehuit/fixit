'use client';

/**
 * ClarificationUI — when AnalyzeResult.uncertainties is non-empty, show
 * each question with 1–3 visual options + a free-text fallback.
 * Owner: Role A.
 *
 * Contract:
 *   - props.uncertainties: Uncertainty[] from the analyze step.
 *   - On submit, calls `onAnswers(answers)` with one ClarifyAnswer per
 *     uncertainty.
 */

import { useState } from 'react';
import type { ClarifyAnswer, Uncertainty } from '@/lib/types';

export type ClarificationUIProps = {
  uncertainties: Uncertainty[];
  onAnswers: (answers: ClarifyAnswer[]) => void;
};

export function ClarificationUI({ uncertainties, onAnswers }: ClarificationUIProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const pick = (field: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    onAnswers(
      uncertainties.map((u) => ({
        field: u.field,
        value: answers[u.field] ?? '',
      })),
    );
  };

  const allAnswered = uncertainties.every((u) => answers[u.field]);

  return (
    <div className="flex flex-col gap-5">
      {uncertainties.map((u) => (
        <div key={u.field} className="flex flex-col gap-3">
          <p className="text-sm font-medium">{u.question_fr}</p>
          <div className="flex flex-wrap gap-2">
            {(u.options ?? []).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => pick(u.field, opt)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  answers[u.field] === opt
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-card)]'
                }`}
              >
                {opt}
              </button>
            ))}
            <input
              type="text"
              placeholder="Autre…"
              onChange={(e) => pick(u.field, e.target.value)}
              className="min-w-[120px] flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={submit}
        disabled={!allAnswered}
        className="self-end rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        Continuer
      </button>
    </div>
  );
}
