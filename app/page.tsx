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
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() => setMode('choose')}
            className="flex items-center gap-2"
            aria-label="Back to home"
          >
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

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-6">
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
      <section className="mb-8 flex max-w-3xl flex-col gap-2">
        <h1 className="text-balance text-2xl font-bold leading-tight text-[color:var(--color-fg)] sm:text-3xl">
          Snap a photo, get a repair video.
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] sm:text-base">
          Pick a sample demo or upload your own photo to start.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <ChooserCard
          onClick={() => onPick('demo')}
          title="Demo mode"
          subtitle="See 3 guided sample repairs"
          icon={<DemoIcon />}
        />
        <ChooserCard
          onClick={() => onPick('upload')}
          title="Try your own"
          subtitle="Upload a photo of what's broken"
          icon={<UploadIcon />}
        />
      </section>
    </>
  );
}

function ChooserCard({
  onClick,
  title,
  subtitle,
  icon,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--color-surface)] text-[color:var(--color-accent)] transition group-hover:scale-105">
        {icon}
      </span>
      <span className="mt-2 text-xl font-semibold text-[color:var(--color-fg)]">{title}</span>
      <span className="text-sm text-[color:var(--color-muted)]">{subtitle}</span>
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-accent)] transition group-hover:gap-2">
        Choose
        <span aria-hidden>→</span>
      </span>
    </button>
  );
}

function DemoView() {
  return (
    <section>
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-[color:var(--color-fg)] sm:text-2xl">
          Pick a sample repair
        </h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          Each demo runs the full live pipeline on a pre-shot photo.
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
    <section className="mx-auto w-full max-w-xs">
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
