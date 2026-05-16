'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { AnalyzeResult, RepairPlan, StreamEvent, Uncertainty } from '@/lib/types';

type StepProgress = {
  keyframeStart?: string;
  keyframeEnd?: string;
  animationUrl?: string;
  narrationUrl?: string;
};

type LogLine = { id: number; message: string; severity?: 'info' | 'warn' | 'error' };

type LiveState = {
  startedAt: number;
  logs: LogLine[];
  analyze: AnalyzeResult | null;
  clarifyUncertainties: Uncertainty[] | null;
  plan: RepairPlan | null;
  stepsProgress: Record<number, StepProgress>;
  finalUrl: string | null;
  error: string | null;
  done: boolean;
};

type Action = { type: 'event'; ev: StreamEvent } | { type: 'connection_closed' };

const initialState = (): LiveState => ({
  startedAt: Date.now(),
  logs: [],
  analyze: null,
  clarifyUncertainties: null,
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
    case 'log': {
      // Drop transient logs once a milestone has landed for the same phase —
      // keep it simple: only push non-transient OR keep last 4 transient lines.
      const next = [...state.logs, { id: ++logId, message: ev.message, severity: ev.severity }];
      // Cap log history at 20 lines to keep the UI tight.
      return { ...state, logs: next.slice(-20) };
    }
    case 'info': {
      const line: LogLine = { id: ++logId, message: ev.message, severity: 'info' };
      return { ...state, logs: [...state.logs, line].slice(-20) };
    }
    case 'analyze_done':
      return { ...state, analyze: ev.result };
    case 'clarify_needed':
      return { ...state, clarifyUncertainties: ev.uncertainties };
    case 'clarify_done':
      return state;
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

export function LiveProgress({
  jobId,
  onVideoReady,
  onOpenVideo,
}: {
  jobId: string;
  onVideoReady?: (url: string) => void;
  onOpenVideo?: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const bottomRef = useRef<HTMLDivElement>(null);
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
      if (ev.type === 'stitch_done') onVideoReadyRef.current?.(ev.video_url);
      if (ev.type === 'done' || ev.type === 'error') es.close();
    };
    es.onerror = () => {
      es.close();
      dispatch({ type: 'connection_closed' });
    };
    return () => es.close();
  }, [jobId]);

  // ---- Auto-scroll ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [
    state.analyze,
    state.clarifyUncertainties,
    state.plan,
    state.stepsProgress,
    state.finalUrl,
    state.logs.length,
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
              Live pipeline
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

      <div className="flex min-h-[420px] flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 sm:min-h-[520px]">
        {/* Logs (rolling, top) */}
        {state.logs.length > 0 ? (
          <section className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
            <ul className="flex flex-col gap-1 font-mono text-xs leading-relaxed">
              {state.logs.map((l) => (
                <li
                  key={l.id}
                  className={
                    l.severity === 'error'
                      ? 'text-[color:var(--color-danger)]'
                      : l.severity === 'warn'
                        ? 'text-[color:var(--color-warn)]'
                        : 'text-[color:var(--color-muted)]'
                  }
                >
                  {l.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Analyze */}
        {state.analyze ? (
          <Card title="1. Identification">
            <SlottedString label="Object" value={state.analyze.object} />
            <SlottedString label="Problem" value={state.analyze.problem_visual} />
            <p className="text-xs text-[color:var(--color-subtle)]">
              Category: {state.analyze.category}
            </p>
          </Card>
        ) : null}

        {/* Clarify (informative) */}
        {state.clarifyUncertainties && state.clarifyUncertainties.length > 0 ? (
          <Card title={`2. Clarifications (${state.clarifyUncertainties.length})`}>
            <p className="text-xs text-[color:var(--color-muted)]">
              The model flagged these uncertainties. The pipeline continues with the most probable
              procedure.
            </p>
            <ul className="flex flex-col gap-2">
              {state.clarifyUncertainties.map((u) => (
                <li
                  key={u.field}
                  className="rounded-md bg-[color:var(--color-surface)] px-3 py-2 text-sm"
                >
                  <p className="font-medium text-[color:var(--color-fg)]">{u.question_fr}</p>
                  {u.options && u.options.length > 0 ? (
                    <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                      Options: {u.options.join(' · ')}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[color:var(--color-muted)]">Free-text answer</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Plan */}
        {state.plan ? (
          <Card
            title={`3. Repair plan · ${state.plan.steps.length} steps · ${state.plan.difficulty} · ~${state.plan.total_duration_min} min`}
          >
            <p className="text-sm font-medium text-[color:var(--color-fg)]">
              {state.plan.problem_summary_fr}
            </p>
            <ol className="flex flex-col gap-1.5 pl-4 text-sm">
              {state.plan.steps.map((s) => {
                const p = state.stepsProgress[s.step_number] ?? {};
                return (
                  <li
                    key={s.step_number}
                    className="list-decimal text-[color:var(--color-fg)] marker:text-[color:var(--color-muted)]"
                  >
                    <span className="font-medium">{s.title_fr}</span>
                    <span className="ml-2 text-xs text-[color:var(--color-muted)]">
                      <CheckChip ok={Boolean(p.keyframeStart && p.keyframeEnd)} label="keyframes" />
                      <CheckChip ok={Boolean(p.animationUrl)} label="anim" />
                      <CheckChip ok={Boolean(p.narrationUrl)} label="narration" />
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : null}

        {/* Final video */}
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

// ---- Sub-components ----

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex animate-[fade-in_220ms_ease-out] flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-white p-4">
      <h3 className="text-sm font-semibold text-[color:var(--color-fg)]">{title}</h3>
      {children}
    </section>
  );
}

function SlottedString({ label, value }: { label: string; value: string }) {
  // analyze.object and analyze.problem_visual are " ; "-separated slotted strings.
  // Render each slot on its own line for readability.
  const slots = value.split(/\s*;\s*/).filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-subtle)]">
        {label}
      </span>
      {slots.length <= 1 ? (
        <p className="text-sm text-[color:var(--color-fg)]">{value}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm text-[color:var(--color-fg)]">
          {slots.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`ml-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        ok
          ? 'bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]'
          : 'bg-[color:var(--color-surface)] text-[color:var(--color-subtle)]'
      }`}
    >
      {ok ? '✓' : '·'} {label}
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
