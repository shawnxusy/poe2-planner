import type { BuildSkill, SkillRole } from "../lib/types";
import { formatSkillId } from "../lib/format";

const ROLE_ORDER: SkillRole[] = ["main", "aura", "trigger", "movement", "secondary"];

const ROLE_LABEL: Record<SkillRole, string> = {
  main: "Main",
  aura: "Aura",
  trigger: "Trigger",
  movement: "Movement",
  secondary: "Secondary",
};

const ROLE_PILL: Record<SkillRole, string> = {
  main: "bg-gold-500/15 text-gold-400 border-gold-500/30",
  aura: "bg-frost-500/15 text-frost-400 border-frost-500/30",
  trigger: "bg-ember-600/15 text-ember-500 border-ember-600/30",
  movement: "bg-ink-700/50 text-ink-300 border-ink-600/40",
  secondary: "bg-ink-700/50 text-ink-400 border-ink-600/40",
};

const SKILL_NAME: Record<SkillRole, string> = {
  main: "text-gold-400",
  aura: "text-frost-400",
  trigger: "text-ember-500",
  movement: "text-ink-100",
  secondary: "text-ink-100",
};

interface Props {
  skills: BuildSkill[];
}

export function SkillPanel({ skills }: Props) {
  if (skills.length === 0) return null;

  const sorted = [...skills].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    if (ai !== bi) return ai - bi;
    return b.links - a.links;
  });

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-gold-500/80">
        Skills
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((skill, i) => (
          <SkillCard key={i} skill={skill} />
        ))}
      </div>
    </section>
  );
}

function SkillCard({ skill }: { skill: BuildSkill }) {
  const name = formatSkillId(skill.skill_id);
  const nameCls = SKILL_NAME[skill.role];
  const pillCls = ROLE_PILL[skill.role];

  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-900/60 overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <div className={`text-sm font-medium leading-snug ${nameCls}`}>
            {name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LevelChip label={`Lv ${skill.level}`} />
            {skill.quality > 0 && (
              <LevelChip label={`Q${skill.quality}`} accent />
            )}
            <LinkChip links={skill.links} />
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${pillCls}`}
        >
          {ROLE_LABEL[skill.role]}
        </span>
      </div>

      {skill.supports.length > 0 && (
        <div className="border-t border-ink-700/40 px-3 pt-2 pb-2.5 flex flex-wrap gap-1.5">
          {skill.supports.map((sup, i) => (
            <SupportBadge key={i} supportId={sup.support_id} level={sup.level} quality={sup.quality} />
          ))}
        </div>
      )}
    </div>
  );
}

function LevelChip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
        accent
          ? "bg-gold-500/10 text-gold-500/80"
          : "bg-ink-800/80 text-ink-400"
      }`}
    >
      {label}
    </span>
  );
}

function LinkChip({ links }: { links: number }) {
  if (links <= 1) return null;
  return (
    <span className="rounded bg-ink-800/60 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 tabular-nums">
      {links}L
    </span>
  );
}

function SupportBadge({ supportId, level, quality }: { supportId: string; level: number; quality: number }) {
  const name = formatSkillId(supportId);
  return (
    <span className="inline-flex items-center gap-1 rounded bg-ink-800/60 px-1.5 py-0.5 text-[10px] text-ink-400">
      {name}
      <span className="font-mono text-ink-600">{level}</span>
      {quality > 0 && <span className="font-mono text-gold-500/60">Q{quality}</span>}
    </span>
  );
}
