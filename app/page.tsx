/**
 * Landing page.
 * Owner: Role A
 *
 * Minimalist, mobile-first. Three demo cards + the live-mode entry.
 * The card components are real (no design system yet) but everything
 * downstream (PhotoUpload, VoiceRecorder, TerminalStream, VideoPlayer) is
 * a stub for Role A to flesh out.
 */

import Link from 'next/link';
import { DemoCard } from '@/components/DemoCard';
import { demoList } from '@/lib/demos';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-[color:var(--color-muted)]">
          Fixit · AI hackathon
        </p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Photo + voix → vidéo de réparation en 90 secondes.
        </h1>
        <p className="text-[color:var(--color-muted)] sm:text-lg">
          Vous avez un objet cassé. Vous le montrez, vous dites le problème. L’IA vous renvoie une
          vidéo personnalisée, voix française, sous-titrée.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm uppercase tracking-widest text-[color:var(--color-muted)]">
          3 exemples préparés
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {demoList.map((demo) => (
            <DemoCard key={demo.id} demo={demo} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6">
        <h2 className="text-lg font-medium">Ou : votre propre situation</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          Le bouton ci-dessous lance le pipeline réel (GPT-5.5 + fal + Tavily + Gradium). Les 3
          exemples ci-dessus, eux, sont pré-générés.
        </p>
        <Link
          href="/live"
          className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
        >
          Essayer avec votre situation →
        </Link>
      </section>

      <footer className="mt-auto pt-8 text-xs text-[color:var(--color-muted)]">
        Stack : Next.js 16 · React 19 · AI SDK 5 · GPT-5.5 · fal.ai · Tavily · Gradium · Vercel
        Fluid Compute.
      </footer>
    </main>
  );
}
