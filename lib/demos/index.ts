/**
 * Demo registry.
 *
 * Each demo card on the landing maps to a pre-shot photo + its FR voice
 * transcript + EN UI labels. Clicking a demo runs the **same live pipeline**
 * as a user upload — there is no separate "cached SSE script" path anymore
 * (the old hand-tuned scripts emitted stale mock data; rebuilt later when
 * a real perceptual-hash cache router lands).
 *
 * The image file name varies per demo (e.g. `bike.png`, `phone.png`,
 * `Fuite.png`). `/api/run` resolves these relative to `public/`.
 */

import type { DemoId } from '../types';

export type DemoMarker = {
  /** X position in percent of the photo box */
  x: number;
  /** Y position in percent of the photo box */
  y: number;
  /** Short label shown on hover */
  label: string;
};

export type DemoMeta = {
  id: DemoId;
  emoji: string;
  /** Public path under /public/ — read from disk by /api/run */
  photo_path: string;
  /** Public URL (for <img src> previews) */
  photo_url: string;
  /** Pre-recorded FR voice transcript fed into /api/analyze */
  transcript: string;
  // ---- UI labels (English) ----
  title: string;
  short: string;
  intro: string;
  problemPhrase: string;
  difficulty: 'Easy' | 'Medium' | 'Advanced';
  estimatedTime: string;
  category: string;
  marker: DemoMarker;
};

export const demos: Record<DemoId, DemoMeta> = {
  'flat-tire': {
    id: 'flat-tire',
    emoji: '🚲',
    photo_path: 'demos/flat-tire/bike.png',
    photo_url: '/demos/flat-tire/bike.png',
    transcript:
      "J'ai crevé en allant bosser et je veux pas appeler un pro, je suis sûr que je peux le faire moi-même.",
    title: 'Fix a flat bike tire',
    short: 'Flat bike tire',
    intro: 'To help you fix your bike, I need a clear photo of the wheel that has the flat.',
    problemPhrase: 'a flat bike tire',
    difficulty: 'Easy',
    estimatedTime: '15 min',
    category: 'Bicycle',
    marker: { x: 78, y: 80, label: 'Flat front tire' },
  },
  'cracked-screen': {
    id: 'cracked-screen',
    emoji: '📱',
    photo_path: 'demos/cracked-screen/phone.png',
    photo_url: '/demos/cracked-screen/phone.png',
    transcript: 'Mon écran est fissuré, est-ce que je peux le réparer moi-même ou il faut un pro ?',
    title: 'Diagnose a cracked iPhone screen',
    short: 'Cracked phone screen',
    intro:
      'To help you assess the damage, I need a photo of your phone that clearly shows the screen.',
    problemPhrase: 'a cracked phone screen',
    difficulty: 'Advanced',
    estimatedTime: '45 min',
    category: 'Electronics',
    marker: { x: 50, y: 42, label: 'Cracked area' },
  },
  'dripping-faucet': {
    id: 'dripping-faucet',
    emoji: '🚰',
    photo_path: 'demos/dripping-faucet/Fuite.png',
    photo_url: '/demos/dripping-faucet/Fuite.png',
    transcript: "Mon robinet fuit à la base, c'est urgent, je veux pas appeler un plombier.",
    title: 'Fix a dripping faucet',
    short: 'Dripping faucet',
    intro:
      'To help you fix the leak, I need a close-up photo of the faucet where the water is dripping.',
    problemPhrase: 'a dripping faucet',
    difficulty: 'Medium',
    estimatedTime: '20 min',
    category: 'Plumbing',
    marker: { x: 50, y: 62, label: 'Leak source' },
  },
};

export const demoList: DemoMeta[] = Object.values(demos);
