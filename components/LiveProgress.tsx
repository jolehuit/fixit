'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import type {
  AnalyzeResult,
  ClarifyAnswer,
  RepairPlan,
  StreamEvent,
  Uncertainty,
} from '@/lib/types';

type StepProgress = {
  keyframeStart?: string;
  keyframeEnd?: string;
  animationUrl?: string;
  narrationUrl?: string;
};

type LogLine = { id: number; message: string; severity?: 'info' | 'warn' | 'error' };

type LiveState = {
  startedAt: number;
  lastLog: LogLine | null;
  analyze: AnalyzeResult | null;
  clarifyUncertainties: Uncertainty[] | null;
  clarifyResolved: boolean;
  plan: RepairPlan | null;
  stepsProgress: Record<number, StepProgress>;
  finalUrl: string | null;
  error: string | null;
  done: boolean;
};

type Action = { type: 'event'; ev: StreamEvent } | { type: 'connection_closed' };

const initialState = (): LiveState => ({
  startedAt: Date.now(),
  lastLog: null,
  analyze: null,
  clarifyUncertainties: null,
  clarifyResolved: false,
  plan: null,
  stepsProgress: {},
  finalUrl: null,
  error: null,
  done: false,
});

let logId = 0;

function reducer(state: LiveState, action: Action): LiveState {
  if (action.type === 'connection_closed') {
    return state.done ? state : { ...state, done: true };
  }
  const ev = action.ev;
  switch (ev.type) {
    case 'log':
      return { ...state, lastLog: { id: ++logId, message: ev.message, severity: ev.severity } };
    case 'info':
      return {
        ...state,
        lastLog: { id: ++logId, message: ev.message, severity: 'info' },
      };
    case 'analyze_done':
      return { ...state, analyze: ev.result };
    case 'clarify_needed':
      return { ...state, clarifyUncertainties: ev.uncertainties };
    case 'clarify_done':
      return { ...state, clarifyResolved: true };
    case 'plan_done':
      return { ...state, plan: ev.result };
    case 'keyframe_done': {
      const prev = state.stepsProgress[ev.step] ?? {};
      return {
        ...state,
        stepsProgress: {
          ...state.stepsProgress,
          [ev.step]: {
            ...prev,
            [ev.kind === 'start' ? 'keyframeStart' : 'keyframeEnd']: ev.url,
          },
        },
      };
    }
    case 'animation_done': {
      const prev = state.stepsProgress[ev.step] ?? {};
      return {
        ...state,
        stepsProgress: { ...state.stepsProgress, [ev.step]: { ...prev, animationUrl: ev.url } },
      };
    }
    case 'narration_done': {
      const prev = state.stepsProgress[ev.step] ?? {};
      return {
        ...state,
        stepsProgress: { ...state.stepsProgress, [ev.step]: { ...prev, narrationUrl: ev.url } },
      };
    }
    case 'stitch_done':
      return { ...state, finalUrl: ev.video_url };
    case 'error':
      return { ...state, error: ev.message, done: true };
    case 'done':
      return { ...state, done: true };
    default:
      return state;
  }
}

// ---- Helpers to extract slots from the slotted analyze strings ----

type Slot = { label: string; value: string };

function parseSlots(slotted: string): Slot[] {
  // Slotted format: "Brand: X ; Model line: Y ; ..."
  return slotted
    .split(/\s*;\s*/)
    .map((chunk) => {
      const m = chunk.match(/^([^:]+):\s*(.*)$/);
      if (!m) return null;
      const value = m[2].trim();
      if (!value) return null; // hide empty slots
      return { label: m[1].trim(), value };
    })
    .filter((s): s is Slot => s !== null);
}

function pickSlot(slots: Slot[], label: string): string | null {
  const s = slots.find((s) => s.label.toLowerCase() === label.toLowerCase());
  return s ? s.value : null;
}

function severityTone(value: string | null): 'minor' | 'moderate' | 'severe' | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes('severe') || v.includes('critical')) return 'severe';
  if (v.includes('moderate')) return 'moderate';
  if (v.includes('minor') || v.includes('mild')) return 'minor';
  return null;
}

export function LiveProgress({
  jobId,
  onAnalyze,
  onVideoReady,
  onOpenVideo,
}: {
  jobId: string;
  /** Receives the AnalyzeResult as soon as it arrives (used by the parent to draw the marker). */
  onAnalyze?: (a: AnalyzeResult) => void;
  onVideoReady?: (url: string) => void;
  onOpenVideo?: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const bottomRef = useRef<HTMLDivElement>(null);
  const onAnalyzeRef = useRef(onAnalyze);
  onAnalyzeRef.current = onAnalyze;
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;

  // ---- SSE subscription ----
  useEffect(() => {
    const es = new EventSource(`/api/stream/${jobId}`);
    es.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data) as StreamEvent;
      } catch {
        return;
      }
      dispatch({ type: 'event', ev });
      if (ev.type === 'analyze_done') onAnalyzeRef.current?.(ev.result);
      if (ev.type === 'stitch_done') onVideoReadyRef.current?.(ev.video_url);
      if (ev.type === 'done' || ev.type === 'error') es.close();
    };
    es.onerror = () => {
      es.close();
      dispatch({ type: 'connection_closed' });
    };
    return () => es.close();
  }, [jobId]);

  // ---- Auto-scroll on new content ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [
    state.analyze,
    state.clarifyUncertainties,
    state.plan,
    state.stepsProgress,
    state.finalUrl,
    state.lastLog?.id,
  ]);

  const elapsedSec = Math.floor((Date.now() - state.startedAt) / 1000);

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-[color:var(--color-border)] bg-white">
      <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-xs font-semibold text-white">
            AI
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-[color:var(--color-fg)]">
              Live diagnosis
            </span>
            <span className="text-xs text-[color:var(--color-muted)]">
              {state.done
                ? state.error
                  ? `Failed after ${elapsedSec}s`
                  : `Complete · ${elapsedSec}s`
                : `Running · ${elapsedSec}s`}
            </span>
          </div>
        </div>
        {!state.done ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-accent)]" />
            live
          </span>
        ) : null}
      </header>

      <div className="flex min-h-[420px] flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 sm:min-h-[520px]">
        {/* Current activity line — only the LATEST log, not a scroll wall */}
        {!state.done && state.lastLog ? <StatusLine line={state.lastLog} /> : null}

        {/* 1. Identification — compact card, slot details collapsed */}
        {state.analyze ? <IdentificationCard analyze={state.analyze} /> : null}

        {/* 2. Clarifications — interactive when active, summary when resolved */}
        {state.clarifyUncertainties && state.clarifyUncertainties.length > 0 ? (
          <ClarifyCard
            jobId={jobId}
            uncertainties={state.clarifyUncertainties}
            resolved={state.clarifyResolved}
          />
        ) : null}

        {/* 3. Repair plan + step progress */}
        {state.plan ? <PlanCard plan={state.plan} progress={state.stepsProgress} /> : null}

        {/* Final CTA — opens the video */}
        {state.finalUrl ? (
          <button
            type="button"
            onClick={onOpenVideo}
            className="mt-2 inline-flex w-fit items-center gap-2 self-start rounded-md bg-[color:var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--color-accent-hover)]"
          >
            <PlayIcon /> Watch the repair video
          </button>
        ) : null}

        {/* Error */}
        {state.error ? (
          <div className="rounded-md border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/5 px-4 py-3 text-sm text-[color:var(--color-danger)]">
            <strong className="font-semibold">Pipeline failed.</strong>
            <span className="ml-1">{state.error}</span>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---- Cards ----

function StatusLine({ line }: { line: LogLine }) {
  const color =
    line.severity === 'error'
      ? 'text-[color:var(--color-danger)]'
      : line.severity === 'warn'
        ? 'text-[color:var(--color-warn)]'
        : 'text-[color:var(--color-muted)]';
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="inline-flex items-end gap-1">
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_infinite] rounded-full bg-[color:var(--color-accent)]" />
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.2s_infinite] rounded-full bg-[color:var(--color-accent)]" />
        <span className="h-1.5 w-1.5 animate-[dot_1.2s_ease-in-out_-0.4s_infinite] rounded-full bg-[color:var(--color-accent)]" />
      </span>
      <span className={color}>{line.message}</span>
    </div>
  );
}

function IdentificationCard({ analyze }: { analyze: AnalyzeResult }) {
  const objSlots = parseSlots(analyze.object);
  const probSlots = parseSlots(analyze.problem_visual);

  const brand = pickSlot(objSlots, 'Brand');
  const modelLine = pickSlot(objSlots, 'Model line');
  const variant = pickSlot(objSlots, 'Model code or variant');
  const headline =
    [brand, modelLine, variant].filter(Boolean).join(' · ') || objSlots[0]?.value || 'Identified';

  const defect = pickSlot(probSlots, 'Defect');
  const located = pickSlot(probSlots, 'located at');
  const severity = pickSlot(probSlots, 'severity');
  const tone = severityTone(severity);

  return (
    <section className="flex animate-[fade-in_220ms_ease-out] flex-col gap-4 rounded-lg border border-[color:var(--color-border)] bg-white p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-full bg-[color:var(--color-accent)]/10 px-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
            {analyze.category}
          </span>
          <h3 className="text-base font-semibold text-[color:var(--color-fg)]">{headline}</h3>
        </div>
        {objSlots.length > 0 ? (
          <SpecSheet
            slots={objSlots.filter(
              (s) =>
                s.label.toLowerCase() !== 'brand' &&
                s.label.toLowerCase() !== 'model line' &&
                s.label.toLowerCase() !== 'model code or variant',
            )}
          />
        ) : null}
      </div>

      {defect || located || severity ? (
        <div className="flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[color:var(--color-fg)]">Problem</h4>
            {tone ? <SeverityPill tone={tone} label={severity ?? tone} /> : null}
          </div>
          {defect ? (
            <p className="text-sm text-[color:var(--color-fg)]">
              <span className="font-medium">{defect}</span>
              {located ? (
                <span className="text-[color:var(--color-muted)]"> · {located}</span>
              ) : null}
            </p>
          ) : null}
          <SpecSheet
            slots={probSlots.filter(
              (s) => !['defect', 'located at', 'severity'].includes(s.label.toLowerCase()),
            )}
          />
        </div>
      ) : null}
    </section>
  );
}

function SpecSheet({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
      {slots.map((s) => (
        <SpecRow key={s.label} label={s.label} value={s.value} />
      ))}
    </dl>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-subtle)] sm:py-0.5">
        {label}
      </dt>
      <dd className="text-sm text-[color:var(--color-fg)] sm:py-0.5">{value}</dd>
    </>
  );
}

function SeverityPill({ tone, label }: { tone: 'minor' | 'moderate' | 'severe'; label: string }) {
  const styles = {
    minor: 'bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]',
    moderate: 'bg-[color:var(--color-warn)]/15 text-[color:var(--color-warn)]',
    severe: 'bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tooltip relative inline-flex">
      <button
        type="button"
        aria-label={text}
        title={text}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[color:var(--color-border-strong)] bg-white text-[10px] font-semibold leading-none text-[color:var(--color-muted)] transition group-hover/tooltip:border-[color:var(--color-accent)] group-hover/tooltip:text-[color:var(--color-accent)]"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-max max-w-xs -translate-x-1/2 rounded-md bg-[color:var(--color-fg)] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover/tooltip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function ClarifyCard({
  jobId,
  uncertainties,
  resolved,
}: {
  jobId: string;
  uncertainties: Uncertainty[];
  resolved: boolean;
}) {
  // answers[field] = value (button choice or free-text)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitted = resolved;

  const setAnswer = (field: string, value: string) => {
    setAnswers((a) => ({ ...a, [field]: value }));
  };

  const allAnswered = uncertainties.every((u) => Boolean(answers[u.field]?.trim()));

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: ClarifyAnswer[] = uncertainties
        .map((u) => ({ field: u.field, value: answers[u.field] ?? '' }))
        .filter((a) => a.value.trim().length > 0);
      const res = await fetch('/api/clarify-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, answers: payload }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit answers.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex animate-[fade-in_220ms_ease-out] flex-col gap-3 rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-bubble-user)]/30 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-[color:var(--color-fg)]">
          {submitted ? 'Your clarifications' : `A few quick questions (${uncertainties.length})`}
        </h3>
        {!submitted ? (
          <span className="text-xs text-[color:var(--color-muted)]">Answer to refine the plan</span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-4">
        {uncertainties.map((u) => {
          const split = splitQuestion(u.question_fr);
          const question = split.question;
          // Prefer explicit purpose_fr; fall back to inline "(— used to …)" parsing.
          const purpose = u.purpose_fr?.trim() || split.purpose;
          const instruction = u.instruction_fr?.trim() || null;
          const placeholder = u.placeholder_fr?.trim() || 'Type your answer…';
          const current = answers[u.field] ?? '';
          return (
            <li
              key={u.field}
              className="flex flex-col gap-2 rounded-md border border-[color:var(--color-border)] bg-white p-3"
            >
              <div className="flex items-start gap-1.5">
                <p className="text-sm font-semibold text-[color:var(--color-fg)]">{question}</p>
                {purpose ? <InfoTooltip text={purpose} /> : null}
              </div>
              {instruction ? (
                <p className="text-xs text-[color:var(--color-muted)]">{instruction}</p>
              ) : null}

              {u.options && u.options.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {u.options.map((opt) => {
                      const active = current === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={submitted || submitting}
                          onClick={() => setAnswer(u.field, opt)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            active
                              ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white shadow-sm ring-2 ring-[color:var(--color-accent)]/30'
                              : 'border-[color:var(--color-border)] bg-white text-[color:var(--color-fg)] hover:border-[color:var(--color-accent)]'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={u.options.includes(current) ? '' : current}
                    disabled={submitted || submitting}
                    onChange={(e) => setAnswer(u.field, e.target.value)}
                    placeholder={`…or type something else (e.g. ${placeholder})`}
                    className="rounded-md border border-[color:var(--color-border)] bg-white px-3 py-1.5 text-sm text-[color:var(--color-fg)] outline-none transition focus:border-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={current}
                  disabled={submitted || submitting}
                  onChange={(e) => setAnswer(u.field, e.target.value)}
                  placeholder={placeholder}
                  className="rounded-md border border-[color:var(--color-border)] bg-white px-3 py-1.5 text-sm text-[color:var(--color-fg)] outline-none transition focus:border-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              )}
            </li>
          );
        })}
      </ul>

      {!submitted ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Continue'}
          </button>
          {submitError ? (
            <span className="text-xs text-[color:var(--color-danger)]">{submitError}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[color:var(--color-accent)]">
          ✓ Sent — the plan is being tailored to your answers.
        </p>
      )}
    </section>
  );
}

function PlanCard({
  plan,
  progress,
}: {
  plan: RepairPlan;
  progress: Record<number, StepProgress>;
}) {
  return (
    <section className="flex animate-[fade-in_220ms_ease-out] flex-col gap-3 rounded-lg border border-[color:var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--color-fg)]">Repair plan</h3>
        <span className="text-xs text-[color:var(--color-muted)]">
          {plan.steps.length} steps · {plan.difficulty} · ~{plan.total_duration_min} min
        </span>
      </div>
      <p className="text-sm text-[color:var(--color-fg)]">{plan.problem_summary_fr}</p>
      <ol className="flex flex-col gap-2 text-sm">
        {plan.steps.map((s) => {
          const p = progress[s.step_number] ?? {};
          const keyframesOk = Boolean(p.keyframeStart && p.keyframeEnd);
          const animOk = Boolean(p.animationUrl);
          const narrOk = Boolean(p.narrationUrl);
          const allOk = keyframesOk && animOk && narrOk;
          return (
            <li
              key={s.step_number}
              className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    allOk
                      ? 'bg-[color:var(--color-accent)] text-white'
                      : 'bg-white text-[color:var(--color-muted)] ring-1 ring-[color:var(--color-border-strong)]'
                  }`}
                >
                  {s.step_number}
                </span>
                <span className="text-[color:var(--color-fg)]">{s.title_fr}</span>
              </span>
              <span className="flex items-center gap-1">
                <ProgressDot ok={keyframesOk} label="frames" />
                <ProgressDot ok={animOk} label="anim" />
                <ProgressDot ok={narrOk} label="voice" />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProgressDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        ok
          ? 'bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]'
          : 'bg-[color:var(--color-surface)] text-[color:var(--color-subtle)]'
      }`}
    >
      <span aria-hidden>{ok ? '✓' : '·'}</span>
      {label}
    </span>
  );
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
    >
      <title>Play</title>
      <path d="M4 3l9 5-9 5V3z" />
    </svg>
  );
}

// "Question here? (— used to do X)" → { question: "Question here?", purpose: "Used to do X" }
function splitQuestion(raw: string): { question: string; purpose: string | null } {
  const match = raw.match(/^(.*?)\s*\(\s*[—-]\s*(.+?)\s*\)\s*$/);
  if (!match) return { question: raw.trim(), purpose: null };
  const purposeRaw = match[2].trim();
  const purpose = purposeRaw.charAt(0).toUpperCase() + purposeRaw.slice(1);
  return { question: match[1].trim(), purpose };
}
