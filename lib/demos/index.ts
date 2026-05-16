/**
 * Demo registry.
 *
 * Each cached demo provides:
 *   - input photo + transcript (served from /public/demos/*)
 *   - final video URL (served from /public/demos/*)
 *   - a hand-tuned SSE script: a function that yields StreamEvents with
 *     realistic timing so the TerminalStream loader looks live.
 *
 * Role D: tune scripts in flat-tire.ts / cracked-screen.ts / dripping-faucet.ts.
 */

import type { DemoId, StreamEvent } from '../types';
import { crackedScreenMeta, crackedScreenScript } from './cracked-screen';
import { drippingFaucetMeta, drippingFaucetScript } from './dripping-faucet';
import { flatTireMeta, flatTireScript } from './flat-tire';

export type DemoMeta = {
  id: DemoId;
  title_fr: string;
  emoji: string;
  /** Public URL served from /public/demos/<id>/input.png */
  photo_url: string;
  /** Simulated transcription from /public/demos/<id>/transcription.txt */
  transcript_fr: string;
  /** Final pre-rendered video served from /public/demos/<id>/output.mp4 */
  video_url: string;
  /** Approximate runtime of the scripted SSE stream */
  target_duration_seconds: number;
};

export type DemoScript = (
  emit: (ev: StreamEvent) => void,
  sleep: (ms: number) => Promise<void>,
) => Promise<void>;

export const demos: Record<DemoId, DemoMeta> = {
  'flat-tire': flatTireMeta,
  'cracked-screen': crackedScreenMeta,
  'dripping-faucet': drippingFaucetMeta,
};

export const demoScripts: Record<DemoId, DemoScript> = {
  'flat-tire': flatTireScript,
  'cracked-screen': crackedScreenScript,
  'dripping-faucet': drippingFaucetScript,
};

export const demoList: DemoMeta[] = Object.values(demos);
