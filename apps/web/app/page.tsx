import { ImportForm } from "../components/ImportForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-16 sm:py-24">
      <header className="mb-12 sm:mb-16">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          <span className="inline-block h-px w-8 bg-gold-500/60" />
          PoE2 Planner
          <span className="inline-block h-px w-8 bg-gold-500/60" />
        </div>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink-100 sm:text-5xl">
          Inspect any{" "}
          <span className="bg-gradient-to-br from-gold-400 to-gold-600 bg-clip-text text-transparent">
            Path of Exile 2
          </span>{" "}
          build.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500 sm:text-lg">
          Paste a Path of Building share code and we&rsquo;ll surface the build&rsquo;s
          headline numbers, passives, items and skills — straight from PoB&rsquo;s
          own snapshot.
        </p>
      </header>

      <section className="flex-1">
        <ImportForm />
      </section>

      <footer className="mt-16 border-t border-ink-700/60 pt-6 text-xs text-ink-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Patch 0.4 — Fate of the Vaal</span>
          <span className="font-mono text-[10px] tracking-wider">
            tier 1 · build browser
          </span>
        </div>
      </footer>
    </main>
  );
}
