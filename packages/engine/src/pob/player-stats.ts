// PoB embeds its own calculated values inside the XML as <PlayerStat> nodes.
// Reading them gives us "ground truth" damage and defense numbers per build —
// huge value for a Tier-1 catalog, and a free fixture set for the engine
// once we start computing values ourselves.
//
// Stats live at PathOfBuilding2.Build.PlayerStat (an array of {stat, value}).

import type { PobXmlRoot } from "./xml.js";

export type PlayerStats = Record<string, number>;

interface PobBuildBlock {
  PlayerStat?: Array<{ "@_stat"?: string; "@_value"?: string }>;
  "@_className"?: string;
  "@_ascendClassName"?: string;
  "@_level"?: string;
  "@_targetVersion"?: string;
}

export interface PobBuildHeader {
  className?: string;
  ascendancy?: string;
  level?: number;
  targetVersion?: string;
}

export function extractPlayerStats(root: PobXmlRoot): PlayerStats {
  const build = pickBuild(root);
  const out: PlayerStats = {};
  for (const ps of build?.PlayerStat ?? []) {
    const k = ps["@_stat"];
    const v = ps["@_value"];
    if (!k || v === undefined) continue;
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function extractBuildHeader(root: PobXmlRoot): PobBuildHeader {
  const build = pickBuild(root);
  const lvl = build?.["@_level"];
  return {
    className: build?.["@_className"],
    ascendancy: build?.["@_ascendClassName"] ?? undefined,
    level: lvl ? Number.parseInt(lvl, 10) : undefined,
    targetVersion: build?.["@_targetVersion"],
  };
}

function pickBuild(root: PobXmlRoot): PobBuildBlock | undefined {
  // PoE2 export uses <PathOfBuilding2>; PoE1 used <PathOfBuilding>. Accept
  // either so codes that get accidentally tagged with the older root still
  // parse.
  const r = (root.PathOfBuilding2 ?? root.PathOfBuilding) as
    | { Build?: PobBuildBlock }
    | undefined;
  return r?.Build;
}

// Common stats we care about, surfaced with friendlier names. Anything missing
// from the build will be null. Extra keys observed on real exports stay
// accessible via the raw PlayerStats map.
export interface DerivedBuildStats {
  combined_dps: number | null;
  total_dps: number | null;
  poison_dps: number | null;
  bleed_dps: number | null;
  ignite_dps: number | null;
  total_ehp: number | null;
  life: number | null;
  es: number | null;
  armour: number | null;
  evasion: number | null;
  fire_res: number | null;
  cold_res: number | null;
  lightning_res: number | null;
  chaos_res: number | null;
  hit_chance: number | null;
  crit_chance: number | null;
  crit_multi: number | null;
  speed: number | null;
}

const N = (s: PlayerStats, k: string): number | null =>
  k in s ? (s[k] as number) : null;

export function derivedStats(s: PlayerStats): DerivedBuildStats {
  return {
    combined_dps: N(s, "CombinedDPS"),
    total_dps: N(s, "TotalDPS"),
    poison_dps: N(s, "WithPoisonDPS") ?? N(s, "PoisonDPS"),
    bleed_dps: N(s, "WithBleedDPS") ?? N(s, "BleedDPS"),
    ignite_dps: N(s, "WithIgniteDPS") ?? N(s, "IgniteDPS"),
    total_ehp: N(s, "TotalEHP"),
    life: N(s, "Life"),
    es: N(s, "EnergyShield"),
    armour: N(s, "Armour"),
    evasion: N(s, "Evasion"),
    fire_res: N(s, "FireResist"),
    cold_res: N(s, "ColdResist"),
    lightning_res: N(s, "LightningResist"),
    chaos_res: N(s, "ChaosResist"),
    hit_chance: N(s, "HitChance"),
    crit_chance: N(s, "CritChance"),
    crit_multi: N(s, "CritMultiplier"),
    speed: N(s, "Speed"),
  };
}
