/**
 * Flat-tire demo script.
 *
 * Role D owns the pacing of these events: this is the *show*.
 * Tune the sleep() values until the rhythm reads as live to a human watching
 * the terminal scroll. Replace the placeholder narration / step counts as
 * the real Role B/C outputs land.
 */

import { mockAnalyzeResult, mockKeyframe, mockRepairPlan } from '../mocks';
import type { DemoMeta, DemoScript } from './index';

export const flatTireMeta: DemoMeta = {
  id: 'flat-tire',
  title_fr: 'Pneu de vélo crevé',
  emoji: '🚲',
  photo_url: '/demos/flat-tire/input.png',
  transcript_fr:
    "J'ai crevé en allant bosser et je veux pas appeler un pro, je suis sûr que je peux le faire moi-même.",
  video_url: '/demos/flat-tire/output.mp4',
  target_duration_seconds: 75,
};

export const flatTireScript: DemoScript = async (emit, sleep) => {
  emit({ type: 'log', message: '> Initialisation du diagnostic…' });
  await sleep(600);

  emit({ type: 'log', message: '⠋ Analyse de l’image (GPT-5.5 vision)…', transient: true });
  await sleep(1800);
  emit({ type: 'analyze_done', result: mockAnalyzeResult({ demoId: 'flat-tire' }) });
  emit({ type: 'log', message: '✓ Objet identifié : vélo, roue arrière, pneu dégonflé' });
  await sleep(700);

  emit({ type: 'log', message: '⠋ Recherche de procédures via Tavily…', transient: true });
  await sleep(2200);
  emit({
    type: 'log',
    message: '  → 4 sources FR retenues (Decathlon, iFixit, Spareka, ManoMano)',
  });
  await sleep(900);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'flat-tire' }) });
  emit({ type: 'log', message: '✓ Plan généré : 5 étapes, ~12 min total' });
  await sleep(800);

  emit({
    type: 'log',
    message: '⠋ Génération des keyframes (gpt-image-2/edit ×10 en parallèle)…',
    transient: true,
  });
  for (let i = 1; i <= 5; i++) {
    await sleep(900 + Math.random() * 400);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });
    if (i === 3) {
      // a small simulated recovery
      emit({
        type: 'log',
        message: '  ⠋ Retry 1/3 sur fal endpoint…',
        severity: 'warn',
        transient: true,
      });
      await sleep(700);
      emit({ type: 'log', message: '  ✓ Recovered' });
    }
    await sleep(700 + Math.random() * 300);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
  }
  emit({ type: 'log', message: '✓ 10 keyframes générées' });
  await sleep(600);

  emit({
    type: 'log',
    message: '⠋ Animation Seedance 2.0 fast (5 clips parallèles)…',
    transient: true,
  });
  for (let i = 1; i <= 5; i++) {
    await sleep(1200 + Math.random() * 500);
    emit({
      type: 'animation_done',
      step: i,
      url: '/demos/flat-tire/output.mp4',
    });
  }
  emit({ type: 'log', message: '✓ 5 clips animés' });
  await sleep(500);

  emit({ type: 'log', message: '⠋ Narration FR via Gradium TTS (5 segments)…', transient: true });
  for (let i = 1; i <= 5; i++) {
    await sleep(450 + Math.random() * 250);
    emit({
      type: 'narration_done',
      step: i,
      url: '/demos/flat-tire/output.mp4',
    });
  }
  emit({ type: 'log', message: '✓ Narration synthétisée' });
  await sleep(500);

  emit({ type: 'log', message: '⠋ Concat ffmpeg + sous-titres FR…', transient: true });
  await sleep(2500);
  emit({ type: 'stitch_done', video_url: flatTireMeta.video_url });
  emit({ type: 'log', message: `✓ Vidéo finale prête (${flatTireMeta.target_duration_seconds}s)` });
  emit({ type: 'done' });
};
