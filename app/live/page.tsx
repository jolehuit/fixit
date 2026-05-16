'use client';

/**
 * /live — free-input entry. Photo + voice → POST /api/run → /job/[id].
 * Owner: Role A.
 *
 * STUB: the form is wired enough to POST and navigate. PhotoUpload returns
 * an object URL (not a public URL) right now — Role A needs to swap that
 * for a Blob URL before the live pipeline can read the photo.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PhotoUpload } from '@/components/PhotoUpload';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import type { RunResponse } from '@/lib/types';

export default function LivePage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const launch = () => {
    if (!photoUrl) return;
    start(async () => {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: photoUrl, transcript_fr: transcript }),
      });
      if (!res.ok) {
        console.error('run failed', await res.text().catch(() => ''));
        return;
      }
      const data = (await res.json()) as RunResponse;
      router.push(`/job/${data.job_id}`);
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <Link
        href="/"
        className="text-xs uppercase tracking-widest text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
      >
        ← Retour
      </Link>
      <h1 className="text-2xl font-semibold">Décrivez votre situation</h1>
      <p className="text-sm text-[color:var(--color-muted)]">
        Une photo de l’objet, une description vocale ou écrite du problème. Le pipeline réel se
        lance ensuite : 60–120 secondes.
      </p>

      <PhotoUpload onUploaded={setPhotoUrl} />
      <VoiceRecorder onTranscript={setTranscript} />

      <button
        type="button"
        onClick={launch}
        disabled={!photoUrl || pending}
        className="rounded-lg bg-[color:var(--color-accent)] px-4 py-3 text-sm font-medium text-black disabled:opacity-40"
      >
        Lancer le diagnostic
      </button>
    </main>
  );
}
