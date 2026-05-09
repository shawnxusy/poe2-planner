import type { BuildHeader, DerivedStats } from "../lib/types";
import { fmtBig, fmtInt, fmtMulti, fmtPercent } from "../lib/format";

interface Props {
  header: BuildHeader;
  stats: DerivedStats;
  passiveCount: number;
  itemCount: number;
  skillCount: number;
}

export function StatsCard({
  header,
  stats,
  passiveCount,
  itemCount,
  skillCount,
}: Props) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-ink-700/80 bg-ink-900/70 shadow-card backdrop-blur">
      {/* Top accent bar */}
      <div className="h-px bg-gradient-to-r from-transparent via-gold-500/60 to-transparent" />

      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500">
            Imported build
          </div>
          <h2 className="mt-1 font-display text-2xl text-gold-400">
            {header.ascendancy ?? header.className ?? "Unknown"}
          </h2>
          <div className="mt-0.5 text-sm text-ink-500">
            {header.className && header.ascendancy
              ? `${header.className} • `
              : null}
            Level {header.level ?? "—"}
            {header.targetVersion ? ` • PoB ${header.targetVersion}` : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-wider">
          <Chip label={`${passiveCount} passives`} />
          <Chip label={`${itemCount} items`} />
          <Chip label={`${skillCount} skills`} />
        </div>
      </header>

      <div className="divider mx-6" />

      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-px bg-ink-700/40 sm:grid-cols-4">
        <Headline label="Combined DPS" value={fmtBig(stats.combined_dps)} accent="gold" />
        <Headline label="Total EHP" value={fmtBig(stats.total_ehp)} accent="frost" />
        <Headline
          label="Crit chance"
          value={fmtPercent(stats.crit_chance)}
          accent="ember"
        />
        <Headline label="Speed" value={stats.speed != null ? stats.speed.toFixed(2) : "—"} accent="ink" />
      </section>

      {/* Two-column body: offense / defense */}
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <Group title="Offense">
          <Row label="Total DPS" value={fmtBig(stats.total_dps)} />
          <Row label="Hit chance" value={fmtPercent(stats.hit_chance, 0)} />
          <Row label="Crit multi" value={fmtMulti(stats.crit_multi)} />
          <Row label="Poison DPS" value={fmtBig(stats.poison_dps)} muted />
          <Row label="Bleed DPS" value={fmtBig(stats.bleed_dps)} muted />
          <Row label="Ignite DPS" value={fmtBig(stats.ignite_dps)} muted />
        </Group>
        <Group title="Defense">
          <Row label="Life" value={fmtInt(stats.life)} />
          <Row label="Energy Shield" value={fmtInt(stats.es)} accent="frost" />
          <Row label="Armour" value={fmtInt(stats.armour)} muted />
          <Row label="Evasion" value={fmtInt(stats.evasion)} muted />
          <ResRow stats={stats} />
        </Group>
      </div>

      <footer className="border-t border-ink-700/60 px-6 py-3 text-[11px] text-ink-500">
        Numbers are extracted from the embedded
        <code className="mx-1 rounded bg-ink-800/80 px-1 py-0.5 font-mono text-[10px] text-gold-400/80">
          &lt;PlayerStat&gt;
        </code>
        snapshot — no recalc.
      </footer>
    </article>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-ink-700 bg-ink-850/80 px-2.5 py-1 text-ink-400">
      {label}
    </span>
  );
}

function Headline({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "gold" | "frost" | "ember" | "ink";
}) {
  const accentCls =
    accent === "gold"
      ? "text-gold-400"
      : accent === "frost"
        ? "text-frost-400"
        : accent === "ember"
          ? "text-ember-500"
          : "text-ink-100";
  return (
    <div className="bg-ink-900/60 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl tabular-nums ${accentCls}`}>
        {value}
      </div>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gold-500/80">
        {title}
      </h3>
      <div className="divide-y divide-ink-700/50 rounded-lg border border-ink-700/40 bg-ink-850/40">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: "frost";
  muted?: boolean;
}) {
  const valueCls = accent === "frost" ? "text-frost-400" : "text-ink-100";
  return (
    <div
      className={`flex items-center justify-between px-3.5 py-2 text-sm ${muted ? "opacity-70" : ""}`}
    >
      <span className="text-ink-500">{label}</span>
      <span className={`font-mono tabular-nums ${valueCls}`}>{value}</span>
    </div>
  );
}

function ResRow({ stats }: { stats: DerivedStats }) {
  const cells: Array<{ key: string; label: string; v: number | null; cls: string }> = [
    {
      key: "fire",
      label: "Fire",
      v: stats.fire_res,
      cls: "text-ember-500",
    },
    {
      key: "cold",
      label: "Cold",
      v: stats.cold_res,
      cls: "text-frost-400",
    },
    {
      key: "light",
      label: "Lightning",
      v: stats.lightning_res,
      cls: "text-gold-400",
    },
    {
      key: "chaos",
      label: "Chaos",
      v: stats.chaos_res,
      cls: "text-fuchsia-400/80",
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-px bg-ink-700/40 px-0 py-0">
      {cells.map((c) => (
        <div
          key={c.key}
          className="flex flex-col items-center gap-0.5 bg-ink-850/40 px-2 py-2"
        >
          <span className="text-[10px] uppercase tracking-wider text-ink-500">
            {c.label}
          </span>
          <span className={`font-mono text-sm tabular-nums ${c.cls}`}>
            {c.v != null ? `${Math.round(c.v)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
