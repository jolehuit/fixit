/**
 * Cracked-screen demo script — features the clarification path
 * (which iPhone model is it?) to showcase the 1–3 visual options UI.
 *
 * Role D: hand-tune the pacing.
 */

import { mockAnalyzeResult, mockKeyframe, mockRepairPlan } from '../mocks';
import type { DemoMeta, DemoScript } from './index';

export const crackedScreenMeta: DemoMeta = {
  id: 'cracked-screen',
  title_fr: 'Écran iPhone fissuré',
  emoji: '📱',
  photo_url: '/demos/cracked-screen/input.png',
  transcript_fr:
    'Mon écran est fissuré, est-ce que je peux le réparer moi-même ou il faut un pro ?',
  video_url: '/demos/cracked-screen/output.mp4',
  target_duration_seconds: 55,
};

export const crackedScreenScript: DemoScript = async (emit, sleep) => {
  emit({ type: 'log', message: '> Initialisation du diagnostic…' });
  await sleep(500);

  emit({ type: 'log', message: '⠋ Analyse de l’image (GPT-5.5 vision)…', transient: true });
  await sleep(1700);
  const analyze = mockAnalyzeResult({ demoId: 'cracked-screen' });
  emit({ type: 'analyze_done', result: analyze });
  emit({ type: 'log', message: '✓ Objet identifié : iPhone (modèle à confirmer)' });
  await sleep(500);

  emit({
    type: 'log',
    message: '⚠ Modèle incertain — 3 options proposées à l’utilisateur',
    severity: 'warn',
  });
  emit({ type: 'clarify_needed', uncertainties: analyze.uncertainties });
  await sleep(1200);
  emit({ type: 'clarify_done' });
  emit({ type: 'log', message: '✓ Utilisateur a choisi : iPhone 15 Pro' });
  await sleep(600);

  emit({ type: 'log', message: '⠋ Recherche de procédures via Tavily…', transient: true });
  await sleep(2000);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'cracked-screen' }) });
  emit({ type: 'log', message: '✓ Plan : 3 étapes (diagnostic + alternatives)' });
  await sleep(700);

  emit({ type: 'log', message: '⠋ Génération keyframes…', transient: true });
  for (let i = 1; i <= 3; i++) {
    await sleep(900 + Math.random() * 300);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });
    await sleep(700 + Math.random() * 300);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
  }
  emit({ type: 'log', message: '✓ 6 keyframes générées' });
  await sleep(500);

  emit({ type: 'log', message: '⠋ Animation Seedance 2.0 fast…', transient: true });
  for (let i = 1; i <= 3; i++) {
    await sleep(1100 + Math.random() * 400);
    emit({ type: 'animation_done', step: i, url: '/demos/cracked-screen/output.mp4' });
  }
  await sleep(400);

  emit({ type: 'log', message: '⠋ Narration FR…', transient: true });
  for (let i = 1; i <= 3; i++) {
    await sleep(450 + Math.random() * 200);
    emit({ type: 'narration_done', step: i, url: '/demos/cracked-screen/output.mp4' });
  }
  await sleep(400);

  emit({ type: 'log', message: '⠋ Concat ffmpeg…', transient: true });
  await sleep(2200);
  emit({ type: 'stitch_done', video_url: crackedScreenMeta.video_url });
  emit({ type: 'done' });
};
