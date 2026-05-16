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
  // ── Init ──────────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '> Fixit — diagnostic en cours…' });
  await sleep(700);

  // ── Analyse visuelle ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Analyse de l\'image (GPT-5.5 vision, detail:auto)…', transient: true });
  await sleep(1300);
  emit({ type: 'log', message: '  → détection plomberie · analyse zone de fuite…', transient: true });
  await sleep(2200);
  emit({ type: 'analyze_done', result: mockAnalyzeResult({ demoId: 'dripping-faucet' }) });
  emit({ type: 'log', message: '✓ Objet identifié : robinet de cuisine col-de-cygne, fuite à la base' });
  await sleep(350);
  emit({ type: 'log', message: '  → tokens : 2 619 · joint torique visiblement usé détecté' });
  await sleep(750);

  // ── Recherche Tavily ──────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Recherche procédures (Tavily · Spareka.fr prioritaire)…', transient: true });
  await sleep(2000);
  emit({ type: 'log', message: '  → 3 sources FR retenues (Spareka, Castorama, bricolage.com)', transient: true });
  await sleep(1400);
  emit({ type: 'log', message: '  → identification pièce : joint torique 12×2 mm · prix : 0,90 €', transient: true });
  await sleep(1000);
  emit({ type: 'plan_done', result: mockRepairPlan({ demoId: 'dripping-faucet' }) });
  emit({ type: 'log', message: '✓ Plan : 4 étapes · remplacement joint · durée estimée 8 min' });
  await sleep(750);

  // ── Génération keyframes ──────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Génération des keyframes (gpt-image-2/edit · 8 frames)…', transient: true });
  await sleep(400);

  for (let i = 1; i <= 4; i++) {
    emit({ type: 'log', message: `  ⠋ frame ${(i * 2) - 1}/8 — étape ${i} (début)…`, transient: true });
    await sleep(1700 + Math.random() * 600);
    emit({ type: 'keyframe_done', step: i, kind: 'start', url: mockKeyframe(i, 'start').url });

    if (i === 4) {
      emit({ type: 'log', message: '  ⠋ Retry 1/3 sur fal endpoint (timeout réseau)…', severity: 'warn', transient: true });
      await sleep(850);
      emit({ type: 'log', message: '  ✓ Recovered — rendu repris sur nœud FR-Paris-2' });
      await sleep(250);
    }

    emit({ type: 'log', message: `  ⠋ frame ${i * 2}/8 — étape ${i} (fin)…`, transient: true });
    await sleep(1500 + Math.random() * 500);
    emit({ type: 'keyframe_done', step: i, kind: 'end', url: mockKeyframe(i, 'end').url });
    await sleep(200);
  }

  emit({ type: 'log', message: '✓ 8 keyframes générées · fidélité robinet référence : élevée' });
  await sleep(600);

  // ── Animation Seedance ────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Animation Seedance 2.0 fast · 4 clips · 720p…', transient: true });
  await sleep(350);

  for (let i = 1; i <= 4; i++) {
    emit({ type: 'log', message: `  ⠋ clip ${i}/4 — rendu en cours…`, transient: true });
    await sleep(2300 + Math.random() * 600);
    emit({ type: 'animation_done', step: i, url: '/demos/dripping-faucet/output.mp4' });
  }

  emit({ type: 'log', message: '✓ 4 clips animés · 20 s de vidéo brute' });
  await sleep(500);

  // ── Narration ─────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Synthèse vocale FR (Gradium TTS · voix Soline)…', transient: true });
  for (let i = 1; i <= 4; i++) {
    emit({ type: 'log', message: `  ⠋ narration étape ${i}/4…`, transient: true });
    await sleep(580 + Math.random() * 280);
    emit({ type: 'narration_done', step: i, url: '/demos/dripping-faucet/output.mp4' });
  }
  emit({ type: 'log', message: '✓ Narration synthétisée · 48 kHz mono · 248 mots' });
  await sleep(500);

  // ── Montage ───────────────────────────────────────────────────────────────
  emit({ type: 'log', message: '⠋ Montage ffmpeg · concat + narration + sous-titres FR…', transient: true });
  await sleep(1100);
  emit({ type: 'log', message: '  → superposition piste audio narration…', transient: true });
  await sleep(1600);
  emit({ type: 'log', message: '  → burn-in sous-titres ASS · upload Vercel Blob…', transient: true });
  await sleep(1200);

  emit({ type: 'stitch_done', video_url: drippingFaucetMeta.video_url });
  emit({ type: 'log', message: '✓ Vidéo finale · 720p · 58 s · narration FR + sous-titres' });
  await sleep(400);
  emit({ type: 'log', message: '─────────────────────────────────────────' });
  emit({ type: 'log', message: '✓ Fuite réparée en autonomie — économie : ~80 € de plombier' });
  emit({ type: 'done' });
};
