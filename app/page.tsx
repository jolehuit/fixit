'use client';

import { useState } from 'react';
import { DemoCard } from '@/components/DemoCard';
import { PhotoUpload } from '@/components/PhotoUpload';
import { demoList } from '@/lib/demos';

type Mode = 'choose' | 'demo' | 'upload';

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('choose');

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() => setMode('choose')}
            className="flex items-center gap-2"
            aria-label="Back to home"
          >
            {/* biome-ignore lint/performance/noImgElement: brand logo, small static asset */}
            <img src="/logo.webp" alt="fixit" className="h-10 w-auto" />
          </button>
          {mode !== 'choose' ? (
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="text-sm text-[color:var(--color-muted)] transition hover:text-[color:var(--color-fg)]"
            >
              ← Back
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 sm:py-14">
        {mode === 'choose' ? <ChooserView onPick={setMode} /> : null}
        {mode === 'demo' ? <DemoView /> : null}
        {mode === 'upload' ? <UploadView /> : null}
      </main>

      <footer className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 text-sm text-[color:var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>© Fixit · AI hackathon</span>
        </div>
      </footer>
    </div>
  );
}

function ChooserView({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <>
      <section className="relative mb-12 flex flex-col items-start gap-5 sm:mb-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-accent)]" />
          AI repair assistant
        </span>
        <h1 className="text-balance text-4xl font-bold leading-[1.05] text-[color:var(--color-fg)] sm:text-6xl">
          Snap a photo.{' '}
          <span className="text-[color:var(--color-accent)]">Get a repair video</span>
          <span className="text-[color:var(--color-muted)]">.</span>
        </h1>
        <p className="max-w-xl text-base text-[color:var(--color-muted)] sm:text-lg">
          Show us what's broken. Our AI looks at your photo, asks a couple of clarifying
          questions, and walks you through the fix — step by step, in 90 seconds.
        </p>
      </section>

      <section className="mb-12 grid gap-4 sm:mb-16 sm:grid-cols-3">
        <Stepper number={1} title="Snap" body="Upload or pick a sample photo of the issue." />
        <Stepper number={2} title="Confirm" body="The AI identifies the part and the defect." />
        <Stepper
          number={3}
          title="Watch"
          body="A guided video shows the fix, step by step."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <ChooserCard
          onClick={() => onPick('demo')}
          title="Try a sample"
          subtitle="3 guided demos — flat tire, cracked screen, dripping faucet."
          icon={<DemoIcon />}
          tone="secondary"
          cta="Browse demos"
        />
        <ChooserCard
          onClick={() => onPick('upload')}
          title="Upload your own"
          subtitle="Take or upload a photo of what's broken at home."
          icon={<UploadIcon />}
          tone="secondary"
          cta="Start upload"
        />
      </section>
    </>
  );
}

function Stepper({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color:var(--color-border)] bg-white p-4">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-xs font-semibold text-white">
        {number}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[color:var(--color-fg)]">{title}</span>
        <span className="text-sm text-[color:var(--color-muted)]">{body}</span>
      </div>
    </div>
  );
}

function ChooserCard({
  onClick,
  title,
  subtitle,
  icon,
  tone,
  cta,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: 'primary' | 'secondary';
  cta: string;
}) {
  const isPrimary = tone === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        isPrimary
          ? 'group flex flex-col gap-3 overflow-hidden rounded-2xl bg-[color:var(--color-accent)] p-8 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[color:var(--color-accent-hover)] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]'
          : 'group flex flex-col gap-3 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]'
      }
    >
      <span
        className={
          isPrimary
            ? 'inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/15 text-white transition group-hover:scale-105'
            : 'inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--color-surface)] text-[color:var(--color-accent)] transition group-hover:scale-105'
        }
      >
        {icon}
      </span>
      <span
        className={`mt-2 text-xl font-semibold ${
          isPrimary ? 'text-white' : 'text-[color:var(--color-fg)]'
        }`}
      >
        {title}
      </span>
      <span
        className={`text-sm ${
          isPrimary ? 'text-white/85' : 'text-[color:var(--color-muted)]'
        }`}
      >
        {subtitle}
      </span>
      <span
        className={`mt-2 inline-flex items-center gap-1 text-sm font-medium transition group-hover:gap-2 ${
          isPrimary ? 'text-white' : 'text-[color:var(--color-accent)]'
        }`}
      >
        {cta}
        <span aria-hidden>→</span>
      </span>
    </button>
  );
}

function DemoView() {
  return (
    <section>
      <div className="mb-8 flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
          Demo mode
        </span>
        <h2 className="text-2xl font-bold text-[color:var(--color-fg)] sm:text-3xl">
          Pick a sample repair
        </h2>
        <p className="max-w-xl text-sm text-[color:var(--color-muted)]">
          Each demo runs the full live pipeline on a pre-shot photo — analyze, clarify, plan
          and generate a step-by-step video.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demoList.map((demo) => (
          <DemoCard key={demo.id} demo={demo} />
        ))}
      </div>
    </section>
  );
}

function UploadView() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
          Live mode
        </span>
        <h2 className="text-2xl font-bold text-[color:var(--color-fg)] sm:text-3xl">
          Upload your photo
        </h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          A clear, well-lit close-up of the issue works best.
        </p>
      </div>
      <PhotoUpload />
    </section>
  );
}

function DemoIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Demo</title>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Upload</title>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
