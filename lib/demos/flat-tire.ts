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
  // ── Init ──────────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '> Fixit — diagnostic en cours…' });
  await sleep(700);

  // ── Analyse visuelle ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Analyse de l\'image (GPT-5.5 vision, detail:auto)…', transient: true });
  await sleep(1400);
  emit({ type: 'log', message: '  → résolution détectée : 4032×3024, mode detail:high activé', transient: true });
  await sleep(2100);
  emit({ type: 'analyze_done', result: mockAnalyzeResult({ demoId: 'flat-tire' }) });
  emit({ type: 'log', message: '✓ Objet identifié : vélo de ville, roue arrière, pneu à plat' });
  await sleep(350);
  emit({ type: 'log', message: '  → tokens : 2 841 · confiance : 97 %' });
  await sleep(700);

  // ── Recherche Tavily ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Recherche de procédures de réparation via Tavily…', transient: true });
  await sleep(2000);
  emit({ type: 'log', message: '  → 4 sources FR retenues (Decathlon, iFixit, Spareka, ManoMano)', transient: true });
  await sleep(1600);
  emit({ type: 'log', message: '  → structuration du plan en cours…', transient: true });
  await sleep(1200);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'flat-tire' }) });
  emit({ type: 'log', message: '✓ Plan généré : 5 étapes · durée estimée 12 min · difficulté : moyenne' });
  await sleep(800);

  // ── Génération keyframes ──────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Génération des keyframes (gpt-image-2/edit · 10 frames · fal.ai)…', transient: true });
  await sleep(500);

  for (let i = 1; i <= 5; i++) {
    emit({ type: 'log', message: `  ⠋ frame ${(i * 2) - 1}/10 — étape ${i} (début)…`, transient: true });
    await sleep(1800 + Math.random() * 600);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });

    // Retry simulé à l'étape 3
    if (i === 3) {
      emit({ type: 'log', message: '  ⠋ Retry 1/3 sur endpoint fal (timeout 504)…', severity: 'warn', transient: true });
      await sleep(900);
      emit({ type: 'log', message: '  ✓ Recovered — reprise sur région EU-West' });
      await sleep(300);
    }

    emit({ type: 'log', message: `  ⠋ frame ${i * 2}/10 — étape ${i} (fin)…`, transient: true });
    await sleep(1500 + Math.random() * 500);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
    await sleep(200);
  }

  emit({ type: 'log', message: '✓ 10 keyframes générées · fidelité référence : élevée' });
  await sleep(600);

  // ── Animation Seedance ────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Animation Seedance 2.0 fast · 5 clips · image-to-video…', transient: true });
  await sleep(400);

  for (let i = 1; i <= 5; i++) {
    emit({ type: 'log', message: `  ⠋ clip ${i}/5 — rendu 720p en cours…`, transient: true });
    await sleep(2400 + Math.random() * 700);
    emit({ type: 'animation_done', step: i, url: '/demos/flat-tire/output.mp4' });
  }

  emit({ type: 'log', message: '✓ 5 clips animés · durée totale : 25 s de vidéo brute' });
  await sleep(550);

  // ── Narration Gradium TTS ─────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Synthèse vocale FR (Gradium TTS · voix Soline)…', transient: true });
  await sleep(400);

  for (let i = 1; i <= 5; i++) {
    emit({ type: 'log', message: `  ⠋ narration étape ${i}/5…`, transient: true });
    await sleep(550 + Math.random() * 300);
    emit({ type: 'narration_done', step: i, url: '/demos/flat-tire/output.mp4' });
  }

  emit({ type: 'log', message: '✓ Narration synthétisée · 48 kHz mono · 312 mots' });
  await sleep(500);

  // ── Montage ffmpeg ────────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Montage ffmpeg · concat + narration + sous-titres FR…', transient: true });
  await sleep(1200);
  emit({ type: 'log', message: '  → concaténation des 5 clips…', transient: true });
  await sleep(1800);
  emit({ type: 'log', message: '  → burn-in sous-titres ASS · police Inter 28px…', transient: true });
  await sleep(1400);
  emit({ type: 'log', message: '  → upload Vercel Blob…', transient: true });
  await sleep(1100);

  emit({ type: 'stitch_done', video_url: flatTireMeta.video_url });
  emit({ type: 'log', message: '✓ Vidéo finale prête · 720p · 67 s · narration FR + sous-titres' });
  await sleep(400);
  emit({ type: 'log', message: '─────────────────────────────────────────' });
  emit({ type: 'log', message: '✓ Pneu arrière : réparable en autonomie — coût matériel < 5 €' });
  emit({ type: 'done' });
};
