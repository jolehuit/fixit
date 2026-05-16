'use client';

/**
 * TerminalStream — the central wow element. Owner: Role A.
 *
 * Consumes the SSE stream from GET /api/stream/:jobId and renders a
 * typewriter-style log. Transient lines (e.g. "uploading frame 3/8")
 * collapse into the last non-transient line above them.
 *
 * Contract:
 *   - props.jobId: id returned by POST /api/run
 *   - Calls `onVideoReady(url)` when a `stitch_done` event arrives.
 *
 * STUB: connects to the SSE feed, parses StreamEvent, renders lines.
 * Visual styling is Role A's. Animation of typewriter / variable timing
 * within a line is Role A's. Transient line behavior is Role A's.
 */

import { useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@/lib/types';

export type TerminalStreamProps = {
  jobId: string;
  onVideoReady?: (url: string) => void;
  onPlan?: (plan: Extract<StreamEvent, { type: 'plan_done' }>['result']) => void;
  onClarifyNeeded?: (
    uncertainties: Extract<StreamEvent, { type: 'clarify_needed' }>['uncertainties'],
  ) => void;
};

type Line = {
  id: number;
  message: string;
  severity?: 'info' | 'warn' | 'error';
  transient?: boolean;
};

let _lineId = 0;
const newLine = (l: Omit<Line, 'id'>): Line => ({ ...l, id: ++_lineId });

export function TerminalStream({
  jobId,
  onVideoReady,
  onPlan,
  onClarifyNeeded,
}: TerminalStreamProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 200);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/stream/${jobId}`);

    es.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }

      switch (ev.type) {
        case 'log':
          setLines((prev) => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].transient) next.pop();
            next.push(
              newLine({
                message: ev.message,
                severity: ev.severity,
                transient: ev.transient,
              }),
            );
            return next;
          });
          break;
        case 'analyze_done':
          setLines((p) => [...p, newLine({ message: `✓ analyze → ${ev.result.object}` })]);
          break;
        case 'plan_done':
          setLines((p) => [
            ...p,
            newLine({ message: `✓ plan → ${ev.result.steps.length} étapes` }),
          ]);
          onPlan?.(ev.result);
          break;
        case 'clarify_needed':
          onClarifyNeeded?.(ev.uncertainties);
          break;
        case 'keyframe_done':
          setLines((p) => [...p, newLine({ message: `  · keyframe ${ev.step}.${ev.kind}` })]);
          break;
        case 'animation_done':
          setLines((p) => [...p, newLine({ message: `  · animation ${ev.step}` })]);
          break;
        case 'narration_done':
          setLines((p) => [...p, newLine({ message: `  · narration ${ev.step}` })]);
          break;
        case 'stitch_done':
          setLines((p) => [...p, newLine({ message: '✓ stitch_done' })]);
          onVideoReady?.(ev.video_url);
          break;
        case 'info':
          setLines((p) => [...p, newLine({ message: `ℹ ${ev.message}`, severity: 'info' })]);
          break;
        case 'error':
          setLines((p) => [...p, newLine({ message: `✗ ${ev.message}`, severity: 'error' })]);
          es.close();
          break;
        case 'done':
          es.close();
          break;
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId, onPlan, onClarifyNeeded, onVideoReady]);

  // auto-scroll on every new line. `lines` is required for the dep array so
  // the effect re-fires; the lint rule misreads the access through scrollRef.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lines drives scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hide h-72 overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-black p-4 font-mono text-xs text-[color:var(--color-fg)]"
    >
      {lines.map((line) => (
        <div
          key={line.id}
          className={
            line.severity === 'error'
              ? 'text-[color:var(--color-danger)]'
              : line.severity === 'warn'
                ? 'text-[color:var(--color-warn)]'
                : line.severity === 'info'
                  ? 'text-[color:var(--color-accent)]'
                  : ''
          }
        >
          {line.message}
        </div>
      ))}
      <div className="mt-2 text-[color:var(--color-muted)]">{elapsed.toFixed(1)}s</div>
    </div>
  );
}
