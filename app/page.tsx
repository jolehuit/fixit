import { DemoCard } from '@/components/DemoCard';
import { demoList } from '@/lib/demos';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-[color:var(--color-fg)]">
              fixit
            </span>
            <span className="text-xs uppercase tracking-widest text-[color:var(--color-subtle)]">
              beta
            </span>
          </div>
          <nav className="hidden gap-6 text-sm text-[color:var(--color-muted)] sm:flex">
            <span>Guides</span>
            <span>How it works</span>
            <span>About</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <section className="flex max-w-3xl flex-col gap-5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
            AI repair assistant
          </span>
          <h1 className="text-balance text-4xl font-bold leading-[1.05] text-[color:var(--color-fg)] sm:text-6xl">
            Get a personalized repair video in 90 seconds.
          </h1>
          <p className="max-w-xl text-lg text-[color:var(--color-muted)]">
            Show us what's broken. Our AI watches your photo, asks a couple of clarifying questions,
            then walks you through the fix step by step.
          </p>
        </section>

        <section className="mt-16 sm:mt-20">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-xl font-semibold text-[color:var(--color-fg)]">
              Try a sample repair
            </h2>
            <span className="text-sm text-[color:var(--color-muted)]">3 guided demos</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {demoList.map((demo) => (
              <DemoCard key={demo.id} demo={demo} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-[color:var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>© Fixit · AI hackathon</span>
          <span>Inspired by the spirit of iFixit — repair is freedom.</span>
        </div>
      </footer>
    </div>
  );
}
