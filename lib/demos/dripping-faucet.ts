/**
 * Dripping-faucet demo script.
 *
 * Role D: hand-tune the pacing.
 */

import { mockAnalyzeResult, mockKeyframe, mockRepairPlan } from '../mocks';
import type { DemoMeta, DemoScript } from './index';

export const drippingFaucetMeta: DemoMeta = {
  id: 'dripping-faucet',
  title_fr: 'Robinet qui fuit',
  emoji: '🚰',
  photo_url: '/demos/dripping-faucet/input.png',
  transcript_fr: "Mon robinet fuit à la base, c'est urgent, je veux pas appeler un plombier.",
  video_url: '/demos/dripping-faucet/output.mp4',
  target_duration_seconds: 65,
};

export const drippingFaucetScript: DemoScript = async (emit, sleep) => {
  emit({ type: 'log', message: '> Initialisation du diagnostic…' });
  await sleep(550);

  emit({ type: 'log', message: '⠋ Analyse de l’image (GPT-5.5 vision)…', transient: true });
  await sleep(1900);
  emit({ type: 'analyze_done', result: mockAnalyzeResult({ demoId: 'dripping-faucet' }) });
  emit({ type: 'log', message: '✓ Objet identifié : robinet col-de-cygne, fuite à la base' });
  await sleep(600);

  emit({ type: 'log', message: '⠋ Recherche Tavily (procédures FR)…', transient: true });
  await sleep(2300);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'dripping-faucet' }) });
  emit({ type: 'log', message: '✓ Plan : 4 étapes, joint à remplacer' });
  await sleep(700);

  emit({ type: 'log', message: '⠋ Génération keyframes…', transient: true });
  for (let i = 1; i <= 4; i++) {
    await sleep(950 + Math.random() * 350);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });
    await sleep(750 + Math.random() * 300);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
  }
  emit({ type: 'log', message: '✓ 8 keyframes générées' });
  await sleep(500);

  emit({ type: 'log', message: '⠋ Animation Seedance 2.0 fast (4 clips)…', transient: true });
  for (let i = 1; i <= 4; i++) {
    await sleep(1200 + Math.random() * 400);
    emit({ type: 'animation_done', step: i, url: '/demos/dripping-faucet/output.mp4' });
  }
  await sleep(450);

  emit({ type: 'log', message: '⠋ Narration FR…', transient: true });
  for (let i = 1; i <= 4; i++) {
    await sleep(450 + Math.random() * 200);
    emit({ type: 'narration_done', step: i, url: '/demos/dripping-faucet/output.mp4' });
  }
  await sleep(400);

  emit({ type: 'log', message: '⠋ Concat ffmpeg + sous-titres…', transient: true });
  await sleep(2400);
  emit({ type: 'stitch_done', video_url: drippingFaucetMeta.video_url });
  emit({ type: 'done' });
};
