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
  // ── Init ──────────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '> Fixit — diagnostic en cours…' });
  await sleep(650);

  // ── Analyse visuelle ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Analyse de l\'image (GPT-5.5 vision, detail:auto)…', transient: true });
  await sleep(1200);
  emit({ type: 'log', message: '  → détection appareil électronique · zoom fissures activé', transient: true });
  await sleep(2000);
  const analyze = mockAnalyzeResult({ demoId: 'cracked-screen' });
  emit({ type: 'analyze_done', result: analyze });
  emit({ type: 'log', message: '✓ Objet identifié : iPhone, écran avant fissuré en étoile' });
  await sleep(350);
  emit({ type: 'log', message: '  → tokens : 3 107 · zone inférieure : intacte' });
  await sleep(700);

  // ── Clarification modèle ──────────────────────────────────────────────────
  emit({ type: 'log', message: '⚠ Modèle exact incertain — compatibilité pièces critique', severity: 'warn' });
  await sleep(500);
  emit({ type: 'clarify_needed', uncertainties: analyze.uncertainties });
  await sleep(300);
  emit({ type: 'log', message: '  → 3 options proposées : iPhone 15 / 15 Pro / 15 Pro Max', transient: true });
  await sleep(1500);
  emit({ type: 'clarify_done' });
  emit({ type: 'log', message: '✓ Modèle confirmé : iPhone 15 Pro — procédure iFixit disponible' });
  await sleep(700);

  // ── Recherche Tavily ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Recherche procédures (Tavily · iFixit.com prioritaire)…', transient: true });
  await sleep(1800);
  emit({ type: 'log', message: '  → guide iFixit iPhone 15 Pro · score pertinence : 0.94', transient: true });
  await sleep(1500);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'cracked-screen' }) });
  emit({ type: 'log', message: '✓ Plan : 3 étapes · diagnostic + alternatives coût/bénéfice' });
  await sleep(700);

  // ── Génération keyframes ──────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Génération des keyframes (gpt-image-2/edit · 6 frames)…', transient: true });
  await sleep(400);

  for (let i = 1; i <= 3; i++) {
    emit({ type: 'log', message: `  ⠋ frame ${(i * 2) - 1}/6 — étape ${i} (début)…`, transient: true });
    await sleep(1900 + Math.random() * 500);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });

    if (i === 2) {
      emit({ type: 'log', message: '  ⠋ Retry 1/3 sur fal endpoint (rate limit)…', severity: 'warn', transient: true });
      await sleep(800);
      emit({ type: 'log', message: '  ✓ Recovered — fallback quality:medium' });
      await sleep(250);
    }

    emit({ type: 'log', message: `  ⠋ frame ${i * 2}/6 — étape ${i} (fin)…`, transient: true });
    await sleep(1600 + Math.random() * 400);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
    await sleep(200);
  }

  emit({ type: 'log', message: '✓ 6 keyframes générées · rendu électronique haute fidélité' });
  await sleep(550);

  // ── Animation Seedance ────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Animation Seedance 2.0 fast · 3 clips…', transient: true });
  await sleep(350);

  for (let i = 1; i <= 3; i++) {
    emit({ type: 'log', message: `  ⠋ clip ${i}/3 — rendu 720p…`, transient: true });
    await sleep(2300 + Math.random() * 600);
    emit({ type: 'animation_done', step: i, url: '/demos/cracked-screen/output.mp4' });
  }

  emit({ type: 'log', message: '✓ 3 clips animés · 15 s de vidéo brute' });
  await sleep(500);

  // ── Narration ─────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Synthèse vocale FR (Gradium TTS)…', transient: true });
  for (let i = 1; i <= 3; i++) {
    emit({ type: 'log', message: `  ⠋ narration étape ${i}/3…`, transient: true });
    await sleep(600 + Math.random() * 250);
    emit({ type: 'narration_done', step: i, url: '/demos/cracked-screen/output.mp4' });
  }
  emit({ type: 'log', message: '✓ Narration synthétisée · 48 kHz mono' });
  await sleep(450);

  // ── Montage ───────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Montage ffmpeg · concat + sous-titres FR…', transient: true });
  await sleep(1100);
  emit({ type: 'log', message: '  → incrustation sous-titres ASS…', transient: true });
  await sleep(1500);
  emit({ type: 'log', message: '  → upload Vercel Blob…', transient: true });
  await sleep(900);

  emit({ type: 'stitch_done', video_url: crackedScreenMeta.video_url });
  emit({ type: 'log', message: '✓ Vidéo finale · 720p · 48 s · narration FR + sous-titres' });
  await sleep(400);
  emit({ type: 'log', message: '─────────────────────────────────────────' });
  emit({ type: 'log', message: '✓ Remplacement écran DIY : faisable · kit iFixit ~45 € vs 250 € SAV' });
  emit({ type: 'done' });
};
