'use client';

/**
 * /job/[id] — terminal stream + final video.
 * Owner: Role A.
 *
 * Read the jobId from the URL, wire TerminalStream → VideoPlayer.
 * If a `clarify_needed` event arrives, surface ClarificationUI; on submit
 * POST /api/clarify with answers so Role D's orchestrator can continue.
 */

import Link from 'next/link';
import { use, useState } from 'react';
import { ClarificationUI } from '@/components/ClarificationUI';
import { TerminalStream } from '@/components/TerminalStream';
import { VideoPlayer } from '@/components/VideoPlayer';
import type { ClarifyAnswer, Uncertainty } from '@/lib/types';

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uncertainties, setUncertainties] = useState<Uncertainty[] | null>(null);

  const submitAnswers = async (answers: ClarifyAnswer[]) => {
    setUncertainties(null);
    await fetch('/api/clarify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analyze: { object: '', category: 'other', problem_visual: '', uncertainties: [] },
        answers,
      }),
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <Link
        href="/"
        className="text-xs uppercase tracking-widest text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
      >
        ← Retour
      </Link>
      <h1 className="text-xl font-medium">Diagnostic en cours</h1>

      {uncertainties ? (
        <ClarificationUI uncertainties={uncertainties} onAnswers={submitAnswers} />
      ) : null}

      <TerminalStream jobId={jobId} onVideoReady={setVideoUrl} onClarifyNeeded={setUncertainties} />

      {videoUrl ? (
        <VideoPlayer url={videoUrl} onReplay={() => window.location.assign('/')} />
      ) : null}
    </main>
  );
}
