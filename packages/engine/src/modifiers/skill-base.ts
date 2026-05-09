// Skill-level modifiers ingest.
//
// The skill metadata in RePoE-Fork carries effects the skill itself contributes
// — base damage scaling, conversion ratios, attack speed multipliers, etc.
// These live across two places:
//
//   1. `raw.static` (top-level)              — flat skill-wide stats like
//      `attack_speed_multiplier`.
//   2. `raw.stat_sets[].static.stats[]`      — typed effects (constant /
//      implicit / explicit) including conversions.
//   3. `raw.stat_sets[].per_level[N]`        — level-scaled values like
//      `damage_multiplier` (PoB calls this "damage effectiveness").
//
// We map these into ModEntries with kind="skill_base" so the resolver and
// damage paths can consume them uniformly with passive / item mods.

import type { BuildSkill, SupportGem } from "@poe2/types";
import type { ModEntry, ModOperator, ModSource, ModTarget } from "./types.js";

// Some stats need bespoke routing (conversion isn't a normal increased/more
// pool member). Conversion entries store the ratio in `value` and use the
// `tags` field to encode source/destination types: e.g.
//   ["conversion", "from_physical", "to_cold"].

interface RawStatSetStat {
  id: string;
  type?: string;
  value: number;
}
interface RawStatSet {
  id?: string;
  static?: { stats?: RawStatSetStat[] };
  per_level?: Record<string, Record<string, number>>;
}

interface RawSkill {
  static?: Record<string, number>;
  stat_sets?: RawStatSet[];
}

// Public: read the runtime skill record (the GameData side) — caller passes
// the same shape we store in ModRecord/SkillRecord types.
interface SkillRuntime {
  metadata_id: string;
  raw: RawSkill;
}

export function skillBaseMods(
  skill: BuildSkill,
  rt: SkillRuntime,
): ModEntry[] {
  const out: ModEntry[] = [];
  const source: ModSource = { kind: "skill_base", ref: `${skill.skill_id}#${skill.level}` };

  // 1. Top-level static — typically the inherent attack speed / cast
  // multiplier baked into the skill.
  const topStatic = rt.raw.static ?? {};
  if (typeof topStatic.attack_speed_multiplier === "number") {
    // Convention used here: positive value is "+X% more Attack Speed", a
    // negative value would be "% less". This matches PoB's interpretation
    // for melee strike skills.
    out.push({
      operator: "MORE",
      target: "attack_speed",
      value: topStatic.attack_speed_multiplier,
      tags: ["attack", "skill_inherent"],
      source_text: `attack_speed_multiplier=${topStatic.attack_speed_multiplier}`,
      source,
      scope: "hit",
    });
  }

  // 2. stat_sets — find the active set matching the skill id, then pull
  // its constant stats and per_level effects.
  const setMatch =
    rt.raw.stat_sets?.find((s) => s.id === rt.metadata_id) ?? rt.raw.stat_sets?.[0];
  if (!setMatch) return out;

  for (const stat of setMatch.static?.stats ?? []) {
    const entry = mapStatSetStatic(stat, source);
    if (entry) out.push(entry);
  }

  // 3. per_level — at the gem's configured level, pull the scaling row.
  const perLevel = setMatch.per_level?.[String(skill.level)];
  if (perLevel) {
    for (const [k, v] of Object.entries(perLevel)) {
      const entry = mapStatSetPerLevel(k, v, source);
      if (entry) out.push(entry);
    }
  }

  return out;
}

function mapStatSetStatic(stat: RawStatSetStat, source: ModSource): ModEntry | null {
  // Phys → Cold conversion baked into the skill (e.g. Ice Strike: 80%).
  if (stat.id === "active_skill_base_physical_damage_%_to_convert_to_cold") {
    return {
      operator: "FLAT",
      target: "physical_damage", // resolver-side: source type
      value: stat.value,
      tags: ["conversion", "from_physical", "to_cold"],
      source_text: `${stat.id}=${stat.value}`,
      source,
      scope: "hit",
    };
  }
  if (stat.id === "active_skill_base_physical_damage_%_to_convert_to_fire") {
    return {
      operator: "FLAT",
      target: "physical_damage",
      value: stat.value,
      tags: ["conversion", "from_physical", "to_fire"],
      source_text: `${stat.id}=${stat.value}`,
      source,
      scope: "hit",
    };
  }
  if (stat.id === "active_skill_base_physical_damage_%_to_convert_to_lightning") {
    return {
      operator: "FLAT",
      target: "physical_damage",
      value: stat.value,
      tags: ["conversion", "from_physical", "to_lightning"],
      source_text: `${stat.id}=${stat.value}`,
      source,
      scope: "hit",
    };
  }
  // Other "is_area_damage" / "step_distance" / display-only stats are flags
  // we don't care about for the calc path.
  return null;
}

function mapStatSetPerLevel(key: string, value: number, source: ModSource): ModEntry | null {
  // PoB calls this "damage effectiveness" — final multiplier on hit damage.
  // 100 = baseline; 196 means 1.96x. We store as MORE any_damage with the
  // raw % delta (i.e. 196 → +96% more damage).
  if (key === "damage_multiplier") {
    return {
      operator: "MORE",
      target: "any_damage",
      value: value - 100,
      tags: ["skill_effectiveness"],
      source_text: `damage_multiplier=${value}`,
      source,
      scope: "hit",
    };
  }
  return null;
}

// Support gem ingest. Each linked support's stat_sets contributes
// modifiers that ONLY apply to its main skill. RePoE uses a stat_id
// suffix convention to encode operator type:
//
//   `*_+%_final` → MORE (multiplicative — applied once per support)
//   `*_+%`       → INCREASED (additive pool)
//   `*_+`        → FLAT
//
// Where the stat ID has a recognised target (e.g. `attack_speed_+%`),
// we route directly. For PoB-internal IDs like
// `support_crescendo_non_final_strike_attack_speed_+%_final` we extract
// the underlying stat from the suffix.
export function supportMods(
  main: BuildSkill,
  supports: SupportGem[],
  lookup: (metadata_id: string) => SkillRuntime | undefined,
): ModEntry[] {
  const out: ModEntry[] = [];
  for (const sup of supports) {
    const rt = lookup(sup.support_id);
    if (!rt) continue;
    const source: ModSource = {
      kind: "support",
      ref: `${sup.support_id}#${main.skill_id}`,
    };
    const set =
      rt.raw.stat_sets?.find((s) => s.id === sup.support_id) ?? rt.raw.stat_sets?.[0];
    if (!set) continue;
    for (const stat of set.static?.stats ?? []) {
      const e = mapSupportStat(stat, source);
      if (e) out.push(e);
    }
  }
  return out;
}

function mapSupportStat(stat: RawStatSetStat, source: ModSource): ModEntry | null {
  if (stat.type && stat.type !== "constant") return null; // ignore implicit/marker flags
  const id = stat.id;

  // Suffix-driven operator detection.
  const isFinalMore = id.endsWith("_+%_final");
  const isIncreased = !isFinalMore && id.endsWith("_+%");
  const isFlat = !isFinalMore && !isIncreased && id.endsWith("_+");

  if (!isFinalMore && !isIncreased && !isFlat) return null;

  const operator: ModOperator = isFinalMore ? "MORE" : isIncreased ? "INCREASED" : "FLAT";

  // Strip the suffix and map the stripped key to a target.
  const trimmed = id
    .replace(/_\+%_final$/, "")
    .replace(/_\+%$/, "")
    .replace(/_\+$/, "");

  const { target, tags } = stripSupportPrefix(trimmed);
  if (!target) return null;

  return {
    operator,
    target,
    value: stat.value,
    tags,
    source_text: `${id}=${stat.value}`,
    source,
    scope: "hit",
  };
}

// Many support stat IDs are prefixed with the support's name + qualifier
// (e.g. `support_crescendo_non_final_strike_attack_speed`). Strip those
// down to a known target. Unknown trims return null target so the caller
// can drop the entry.
function stripSupportPrefix(key: string): { target: ModTarget | null; tags: string[] } {
  const tags: string[] = [];
  let stripped = key;

  // Drop the leading "support_<name>_" prefix and any trailing "_final" segment.
  const supMatch = stripped.match(/^support_[a-z0-9]+_(.+)$/);
  if (supMatch) stripped = supMatch[1]!;

  // Conditional sub-phrases pickup as tags.
  if (stripped.startsWith("non_final_strike_")) {
    tags.push("conditional", "non_final_strike");
    stripped = stripped.replace(/^non_final_strike_/, "");
  }
  if (stripped.startsWith("attack_skills_")) {
    tags.push("attack");
    stripped = stripped.replace(/^attack_skills_/, "");
  }
  if (stripped.startsWith("melee_skills_")) {
    tags.push("attack", "melee");
    stripped = stripped.replace(/^melee_skills_/, "");
  }

  // Now stripped should match a known stat-id base (no operator suffix).
  // Direct mapping table for the common targets supports adjust.
  const TARGET_MAP: Record<string, ModTarget> = {
    attack_speed: "attack_speed",
    cast_speed: "cast_speed",
    skill_speed: "skill_speed",
    critical_strike_chance: "crit_chance",
    critical_strike_multiplier: "crit_damage",
    physical_damage: "physical_damage",
    fire_damage: "fire_damage",
    cold_damage: "cold_damage",
    lightning_damage: "lightning_damage",
    chaos_damage: "chaos_damage",
    elemental_damage: "elemental_damage",
    spell_damage: "spell_damage",
    attack_damage: "attack_damage",
    projectile_damage: "projectile_damage",
    area_damage: "area_damage",
    melee_damage: "attack_damage",
    damage: "any_damage",
    accuracy_rating: "accuracy_rating",
    poison_damage: "poison_damage",
    ignite_damage: "ignite_damage",
    bleed_damage: "bleed_damage",
  };

  return { target: TARGET_MAP[stripped] ?? null, tags };
}
