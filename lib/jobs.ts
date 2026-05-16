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

import type { ClarifyAnswer, StreamEvent } from './types';

type Subscriber = (event: StreamEvent) => void;

type Channel = {
  id: string;
  buffer: StreamEvent[];
  subscribers: Set<Subscriber>;
  closed: boolean;
  createdAt: number;
  /** Original input photo (data URL) — served by GET /api/jobs/[id]/photo. */
  photoDataUrl: string | null;
};

const channels = new Map<string, Channel>();

// ---- Interactive clarify: per-job resolver awaiting user answers ----

type ClarifyResolver = (answers: ClarifyAnswer[] | null) => void;
const clarifyResolvers = new Map<string, ClarifyResolver>();

/**
 * Pause the orchestrator until the user POSTs answers (or the timeout fires).
 * Returns the answers, or `null` if the wait timed out / was skipped.
 */
export function waitForClarify(jobId: string, timeoutMs: number): Promise<ClarifyAnswer[] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clarifyResolvers.delete(jobId);
      resolve(null);
    }, timeoutMs);
    clarifyResolvers.set(jobId, (answers) => {
      clearTimeout(timer);
      clarifyResolvers.delete(jobId);
      resolve(answers);
    });
  });
}

/** Called by POST /api/clarify-resolve. Returns true if a waiter was resolved. */
export function resolveClarify(jobId: string, answers: ClarifyAnswer[] | null): boolean {
  const resolver = clarifyResolvers.get(jobId);
  if (!resolver) return false;
  resolver(answers);
  return true;
}

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
    photoDataUrl: null,
  });
}

/** Attach the original input photo to a job so the frontend can fetch it. */
export function setPhoto(jobId: string, photoDataUrl: string): void {
  const ch = channels.get(jobId);
  if (!ch) return;
  ch.photoDataUrl = photoDataUrl;
}

/** Returns null if the job is unknown or the photo wasn't stored. */
export function getPhoto(jobId: string): string | null {
  return channels.get(jobId)?.photoDataUrl ?? null;
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
