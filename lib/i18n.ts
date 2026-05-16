import type { DemoId } from './types';

/**
 * Frontend-only EN labels for the cached demos.
 * The backend (Role D) keeps title_fr in lib/demos for the narration domain;
 * the UI surfaces these EN versions.
 */
export const demoLabels: Record<
  DemoId,
  {
    title: string;
    short: string;
    intro: string;
    problemPhrase: string;
    difficulty: string;
    estimatedTime: string;
    category: string;
  }
> = {
  'flat-tire': {
    title: 'Fix a flat bike tire',
    short: 'Flat bike tire',
    intro: 'To help you fix your bike, I need a clear photo of the wheel that has the flat.',
    problemPhrase: 'a flat bike tire',
    difficulty: 'Easy',
    estimatedTime: '15 min',
    category: 'Bicycle',
  },
  'cracked-screen': {
    title: 'Diagnose a cracked iPhone screen',
    short: 'Cracked phone screen',
    intro:
      'To help you assess the damage, I need a photo of your phone that clearly shows the screen.',
    problemPhrase: 'a cracked phone screen',
    difficulty: 'Advanced',
    estimatedTime: '45 min',
    category: 'Electronics',
  },
  'dripping-faucet': {
    title: 'Fix a dripping faucet',
    short: 'Dripping faucet',
    intro:
      'To help you fix the leak, I need a close-up photo of the faucet where the water is dripping.',
    problemPhrase: 'a dripping faucet',
    difficulty: 'Medium',
    estimatedTime: '20 min',
    category: 'Plumbing',
  },
};

export const modelQuestion: Partial<Record<DemoId, { question: string; options: string[] }>> = {
  'cracked-screen': {
    question: 'Which model is it?',
    options: ['iPhone 15', 'iPhone 14', 'iPhone 13', 'Another model'],
  },
};

/**
 * Coordinates (in % of the photo's box) where the assistant has located
 * the issue. A pulsing marker is rendered there once the diagnosis is ready;
 * clicking it opens the repair video.
 */
export const problemMarker: Record<DemoId, { x: number; y: number; label: string }> = {
  // tuned to the front (right in frame) wheel of the cached bike photo
  'flat-tire': { x: 78, y: 80, label: 'Flat front tire' },
  'cracked-screen': { x: 50, y: 42, label: 'Cracked area' },
  'dripping-faucet': { x: 50, y: 62, label: 'Leak source' },
};
