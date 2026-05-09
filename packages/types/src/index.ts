// Patch-level identifier ("0.4", "0.5", etc.).
export type PatchVersion = string;

export type DamageType = "physical" | "fire" | "cold" | "lightning" | "chaos";

export type ElementalDamageType = Exclude<DamageType, "physical" | "chaos">;

export type AilmentType =
  | "ignite"
  | "bleed"
  | "poison"
  | "chill"
  | "freeze"
  | "shock"
  | "electrocute";

export type ItemSlot =
  | "weapon"
  | "offhand"
  | "helmet"
  | "body_armour"
  | "gloves"
  | "boots"
  | "amulet"
  | "ring_left"
  | "ring_right"
  | "belt";

export type ItemRarity = "normal" | "magic" | "rare" | "unique";

export type SkillRole = "main" | "secondary" | "aura" | "trigger" | "movement";

export type EnemyType = "boss" | "rare" | "magic" | "white";

export type BuildArchetype =
  | "hit"
  | "dot_ignite"
  | "dot_poison"
  | "dot_bleed"
  | "minion"
  | "cast_on_x"
  | "hybrid";

export type ConfidenceTier = "high" | "medium" | "low";

// Confidence in a calc result, with a human-readable reason for the rating.
export interface ConfidenceAssessment {
  tier: ConfidenceTier;
  reason: string;
}

// Inputs the engine assumes about external state when computing DPS/EHP.
// Mirrors the PoB Configuration panel — extracting these from the PoB code
// is what eliminates the biggest source of drift vs. PoB.
export interface CalcAssumptions {
  frenzy_charges: number;
  power_charges: number;
  endurance_charges: number;
  flasks_active: boolean;
  onslaught: boolean;
  enemy_type: EnemyType;
  // Pinned by default to PoE2's standard endgame encounter resists.
  // Engine still honours per-skill penetration/exposure on top.
  enemy_resistances: Resistances;
}

export interface SupportGem {
  support_id: string;
  level: number;
  quality: number;
}

export interface BuildSkill {
  skill_id: string;
  level: number;
  quality: number;
  role: SkillRole;
  supports: SupportGem[];
  // Total link count including the main gem (PoB stores this as gem socket group size).
  links: number;
}

export interface ItemAffix {
  // Resolved mod_id from RePoE-Fork. Null when the affix can't be matched
  // (custom corrupted mod, league mod, etc.) — engine should fall back to
  // the raw stat text in `text`.
  mod_id: string | null;
  text: string;
  values: number[];
}

export interface BuildItem {
  slot: ItemSlot;
  base_item: string;
  rarity: ItemRarity;
  // Set when rarity === "unique"; references unique_items.name.
  unique_name: string | null;
  implicits: ItemAffix[];
  affixes: ItemAffix[];
  // Corruptions live in `affixes` with corrupted=true on their mod_id;
  // surfaced here as a flag so defense calcs can apply implicit modifiers.
  is_corrupted: boolean;
}

// Identifier for a passive node in the GGG skilltree-export JSON.
export interface PassiveNode {
  node_id: string;
}

// Everything the engine needs to compute DPS + EHP for a build.
// Produced by the PoB parser; consumed by `packages/engine`.
export interface BuildInput {
  patch_version: PatchVersion;
  character_class: string;
  ascendancy: string | null;
  level: number;
  passives: PassiveNode[];
  items: BuildItem[];
  skills: BuildSkill[];
  assumptions: CalcAssumptions;
  // Free-form mod text from PoE2 campaign quest rewards (e.g. "+5 to All
  // Attributes", "25% increased Stun Threshold"). PoB stores these in the
  // <Config> block as `string` Inputs prefixed `questAct…`. They feed the
  // same modifier resolver pipeline as item mods.
  quest_rewards?: string[];
}

// One row in a damage calc breakdown — main hit, an ailment, a triggered
// skill, etc. Sum of `per_second` across rows for a single role should
// roughly equal that role's contribution to total DPS.
export interface DamageBreakdown {
  damage_type: DamageType;
  source: string;
  per_hit: number;
  per_second: number;
}

export interface DamageResult {
  boss_dps: number;
  clear_dps: number;
  breakdown: DamageBreakdown[];
  confidence: ConfidenceAssessment;
  assumptions: CalcAssumptions;
}

// Per-element resistance values. `*_max` tracks the cap (default 75, can
// exceed with gear like "+5% to maximum cold resistance").
export interface Resistances {
  fire: number;
  cold: number;
  lightning: number;
  chaos: number;
  fire_max: number;
  cold_max: number;
  lightning_max: number;
  chaos_max: number;
}

export interface DefenseResult {
  ehp: number;
  life: number;
  es: number;
  armour: number;
  armour_dr_pct: number;
  evasion: number;
  evasion_chance_pct: number;
  resistances: Resistances;
  confidence: ConfidenceAssessment;
}

// Top-level engine output — what `calculate(input)` returns.
export interface CalcResult {
  damage: DamageResult;
  defense: DefenseResult;
}

// Default endgame enemy resistances (T16 maps / pinnacle bosses).
// Engine seeds CalcAssumptions.enemy_resistances with this when not provided.
export const DEFAULT_ENEMY_RESISTANCES: Resistances = {
  fire: 50,
  cold: 50,
  lightning: 50,
  chaos: 30,
  fire_max: 75,
  cold_max: 75,
  lightning_max: 75,
  chaos_max: 75,
};

export const DEFAULT_ASSUMPTIONS: CalcAssumptions = {
  frenzy_charges: 0,
  power_charges: 0,
  endurance_charges: 0,
  flasks_active: false,
  onslaught: false,
  enemy_type: "boss",
  enemy_resistances: DEFAULT_ENEMY_RESISTANCES,
};
