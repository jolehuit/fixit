/**
 * Mock data factories. Every stubbed API route returns a value built
 * from here so that:
 *   - All 4 roles can develop against typed fake responses from minute 1.
 *   - Switching a stub to its real implementation only touches one file.
 *
 * Each factory output is validated by its Zod schema before return, so
 * mocks can never silently drift from the contract in lib/types.ts.
 */

import {
  AnalyzeResult,
  AnimatedClip,
  type DemoId,
  FinalVideo,
  Keyframe,
  NarrationAudio,
  RepairPlan,
  type RepairStep,
} from './types';

const PLACEHOLDER_IMG = 'https://placehold.co/1280x720/png?text=keyframe';
const PLACEHOLDER_MP4 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';
const PLACEHOLDER_WAV = 'https://www.w3schools.com/html/horse.wav';
const PLACEHOLDER_FINAL_MP4 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4';

export function mockAnalyzeResult(opts?: { demoId?: DemoId }): AnalyzeResult {
  if (opts?.demoId === 'cracked-screen') {
    return AnalyzeResult.parse({
      object: 'iPhone 15 avec écran fissuré',
      category: 'electronics',
      problem_visual: 'Écran avant fissuré en étoile, partie inférieure intacte.',
      uncertainties: [
        {
          field: 'model',
          question_fr: 'Quel modèle exact ?',
          options: ['iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max'],
        },
      ],
    });
  }
  if (opts?.demoId === 'dripping-faucet') {
    return AnalyzeResult.parse({
      object: 'Robinet de cuisine col-de-cygne',
      category: 'plumbing',
      problem_visual: 'Fuite au niveau de la base, joint visiblement usé.',
      uncertainties: [],
    });
  }
  return AnalyzeResult.parse({
    object: 'Vélo de ville, roue arrière',
    category: 'vehicle',
    problem_visual: 'Pneu arrière dégonflé, jante au sol.',
    uncertainties: [],
  });
}

function mockSteps(): RepairStep[] {
  return [
    {
      step_number: 1,
      title_fr: 'Démonter la roue arrière',
      description_fr: "Ouvrir le frein, dévisser l'axe, sortir la roue du cadre.",
      parts_needed: [],
      tools_needed: ['Clé de 15'],
      duration_seconds: 90,
      visual_prompt_start: 'Bike rear wheel still mounted, wrench approaching the axle',
      visual_prompt_end: 'Bike rear wheel fully removed from the frame, lying on the ground',
      motion_prompt: 'Hands unscrew the axle, then lift the wheel out of the frame',
      narration_fr:
        "Commencez par ouvrir le frein arrière et dévissez l'axe à la clé de 15. Sortez la roue du cadre en la tirant vers le bas.",
    },
    {
      step_number: 2,
      title_fr: 'Démonter le pneu',
      description_fr: 'Utiliser les démonte-pneus pour décoincer le pneu de la jante.',
      parts_needed: [],
      tools_needed: ['Démonte-pneus (x2)'],
      duration_seconds: 120,
      visual_prompt_start: 'Tire lever positioned between tire bead and rim',
      visual_prompt_end: 'Tire bead fully separated from the rim around the entire circumference',
      motion_prompt: 'A second lever slides around the rim, popping the bead free',
      narration_fr:
        'Glissez le premier démonte-pneu entre le pneu et la jante. Faites-le levier, puis utilisez le second pour parcourir tout le tour.',
    },
    {
      step_number: 3,
      title_fr: 'Trouver la fuite',
      description_fr: "Gonfler légèrement la chambre à air et l'immerger pour localiser la fuite.",
      parts_needed: [],
      tools_needed: ['Bassine d’eau', 'Pompe'],
      duration_seconds: 60,
      visual_prompt_start: 'Inner tube partially inflated, held above a bowl of water',
      visual_prompt_end: 'Inner tube submerged, small bubbles rising from one spot',
      motion_prompt: 'The tube is rotated underwater, bubbles appear at the puncture',
      narration_fr:
        "Gonflez légèrement la chambre à air et plongez-la dans l'eau. Le trou se révèle par un chapelet de bulles.",
    },
    {
      step_number: 4,
      title_fr: 'Coller la rustine',
      description_fr: 'Poncer, appliquer la colle, attendre 1 min, appliquer la rustine.',
      parts_needed: ['Rustine', 'Colle'],
      tools_needed: ['Papier abrasif'],
      duration_seconds: 120,
      visual_prompt_start: 'Hand sanding a small area around the puncture',
      visual_prompt_end: 'Patch firmly pressed onto the tube over the punctured area',
      motion_prompt: 'A thin layer of glue is spread, then the patch is pressed down',
      narration_fr:
        'Poncez légèrement la zone, étalez une fine couche de colle, attendez une minute, puis appliquez la rustine en pressant fort.',
    },
    {
      step_number: 5,
      title_fr: 'Remonter et regonfler',
      description_fr: 'Remettre la chambre, le pneu, remonter la roue, regonfler.',
      parts_needed: [],
      tools_needed: ['Pompe'],
      duration_seconds: 120,
      visual_prompt_start: 'Inner tube being placed back inside the tire on the rim',
      visual_prompt_end: 'Pump connected to the valve, tire visibly firm',
      motion_prompt: 'Tire bead is rolled back onto the rim, then the pump inflates the tire',
      narration_fr:
        'Replacez la chambre, remontez le pneu, remettez la roue sur le cadre, puis gonflez à 3 bars.',
    },
  ];
}

export function mockRepairPlan(opts?: { demoId?: DemoId }): RepairPlan {
  return RepairPlan.parse({
    problem_summary_fr:
      opts?.demoId === 'cracked-screen'
        ? 'Écran iPhone fissuré — diagnostic et alternatives DIY.'
        : opts?.demoId === 'dripping-faucet'
          ? "Fuite au niveau de la base d'un robinet de cuisine — remplacement du joint."
          : 'Pneu arrière de vélo crevé — réparation par rustine.',
    difficulty: 'medium',
    total_duration_min: 12,
    steps: mockSteps(),
  });
}

export function mockKeyframe(step: number, kind: 'start' | 'end'): Keyframe {
  return Keyframe.parse({ step_number: step, kind, url: PLACEHOLDER_IMG });
}

export function mockAnimatedClip(step: number): AnimatedClip {
  return AnimatedClip.parse({ step_number: step, url: PLACEHOLDER_MP4, duration_seconds: 5 });
}

export function mockNarrationAudio(step: number): NarrationAudio {
  return NarrationAudio.parse({
    step_number: step,
    url: PLACEHOLDER_WAV,
    duration_seconds: 6.5,
  });
}

export function mockFinalVideo(): FinalVideo {
  return FinalVideo.parse({ url: PLACEHOLDER_FINAL_MP4, duration_seconds: 60 });
}
