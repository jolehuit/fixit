import { DemoCard } from '@/components/DemoCard';
import { PhotoUpload } from '@/components/PhotoUpload';
import { demoList } from '@/lib/demos';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <img src="/logo.webp" alt="fixit" className="h-10 w-auto" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-6">
        <section className="mb-6 flex max-w-3xl flex-col gap-2">
          <h1 className="text-balance text-2xl font-bold leading-tight text-[color:var(--color-fg)] sm:text-3xl">
            Snap a photo, get a repair video.
          </h1>
          <p className="text-sm text-[color:var(--color-muted)] sm:text-base">
            Pick a guide below or upload your own. The AI walks you through the fix.
          </p>
        </section>
        <section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {demoList.map((demo) => (
              <DemoCard key={demo.id} demo={demo} />
            ))}
            <PhotoUpload />
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 text-sm text-[color:var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>© Fixit · AI hackathon</span>
        </div>
      </footer>
    </div>
  );
}
