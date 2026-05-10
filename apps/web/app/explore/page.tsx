import Link from "next/link";
import { ExploreForm } from "../../components/ExploreForm";

export const metadata = {
  title: "PoE2 Planner — Explore a build concept",
  description:
    "Describe a mechanic or archetype and let the AI design a Path of Exile 2 build concept.",
};

export default function ExplorePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-16 sm:py-24">
      <header className="mb-12 sm:mb-14">
        <nav className="mb-8 flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-ink-500">
          <Link href="/" className="hover:text-ink-100 transition">
            ← Build browser
          </Link>
          <span className="text-ink-700">|</span>
          <span className="text-gold-500/70">Explore</span>
        </nav>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          <span className="inline-block h-px w-8 bg-gold-500/60" />
          Build Architect
          <span className="inline-block h-px w-8 bg-gold-500/60" />
        </div>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink-100 sm:text-5xl">
          Explore a{" "}
          <span className="bg-gradient-to-br from-gold-400 to-gold-600 bg-clip-text text-transparent">
            build concept
          </span>
          .
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
          Describe a mechanic, unique item, or archetype. The AI will ground
          itself in real PoE2 0.4 data and propose a coherent build — passives
          checked for tree proximity, skills confirmed against the gem database.
        </p>
      </header>

      <section className="flex-1">
        <ExploreForm />
      </section>

      <footer className="mt-16 border-t border-ink-700/60 pt-6 text-xs text-ink-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Patch 0.4 — Fate of the Vaal</span>
          <span className="font-mono text-[10px] tracking-wider">
            tier 2 · ai recommender
          </span>
        </div>
      </footer>
    </main>
  );
}
