/**
 * In-memory job channel.
 *
 * Each job has a buffer of past events + a set of active subscribers.
 * - POST /api/run creates a job, runs the orchestrator (async), pushes events.
 * - GET  /api/stream/:jobId subscribes to the channel and replays the buffer.
 *
 * This works on Fluid Compute because invocations share a single instance.
 * For multi-instance or persistent-after-restart behavior, swap this file's
 * internals for Upstash Redis pub/sub (or any pub/sub). The public API
 * (createJob/emit/subscribe/closeJob) stays the same.
 */

import type { StreamEvent } from './types';

type Subscriber = (event: StreamEvent) => void;

type Channel = {
  id: string;
  buffer: StreamEvent[];
  subscribers: Set<Subscriber>;
  closed: boolean;
  createdAt: number;
};

const channels = new Map<string, Channel>();

// Garbage-collect closed jobs after a delay so a slow client still has time
// to drain the buffer.
const GC_DELAY_MS = 5 * 60_000;

export function newJobId(): string {
  // Avoid pulling in `uuid` for a 36-char id during a hackathon.
  return `j_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createJob(jobId: string): void {
  channels.set(jobId, {
    id: jobId,
    buffer: [],
    subscribers: new Set(),
    closed: false,
    createdAt: Date.now(),
  });
}

export function emit(jobId: string, event: StreamEvent): void {
  const ch = channels.get(jobId);
  if (!ch || ch.closed) return;
  ch.buffer.push(event);
  for (const sub of ch.subscribers) {
    try {
      sub(event);
    } catch {
      // never let one slow subscriber take down the rest
    }
  }
}

export function subscribe(jobId: string, sub: Subscriber): () => void {
  const ch = channels.get(jobId);
  if (!ch) {
    // Subscribing before createJob ran — treat as no-op so the SSE route can
    // still hold the connection open and surface a future `error` event.
    return () => {};
  }
  for (const ev of ch.buffer) sub(ev);
  ch.subscribers.add(sub);
  return () => {
    ch.subscribers.delete(sub);
  };
}

export function closeJob(jobId: string): void {
  const ch = channels.get(jobId);
  if (!ch) return;
  ch.closed = true;
  setTimeout(() => {
    channels.delete(jobId);
  }, GC_DELAY_MS);
}

export function hasJob(jobId: string): boolean {
  return channels.has(jobId);
}
