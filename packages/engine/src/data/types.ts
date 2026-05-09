// In-memory snapshot of the patch data the engine needs at calc time.
// Populated once per patch_version (the values are immutable for a given
// patch), then reused across many calculate() calls.
//
// The shape is intentionally narrow — we only carry fields the calc paths
// touch. Raw RePoE-Fork records stay in the DB for ingest use only.

export interface PassiveRecord {
  // Numeric hash from the passive tree (matches PoB's <Spec @_nodes>).
  hash: number;
  // Stable string id from RePoE (e.g. "lightning14"). Useful for telemetry.
  id: string;
  name: string;
  type: string;
  // Stat IDs only — values live in `stats_values` keyed by the same id.
  stat_ids: string[];
  stats_values: Record<string, number>;
  is_keystone: boolean;
  is_notable: boolean;
}

export interface SkillRecord {
  metadata_id: string;
  name: string;
  // "active" or "support" — engine uses this to decide whether the gem
  // contributes a base damage skill or a layer of modifiers.
  gem_type: "active" | "support" | string;
  tags: string[];
  // From RePoE's per_level dict — values resolved per gem level.
  // Keys vary per skill: e.g. "damage_effectiveness", "base_fire_damage_min"…
  per_level?: Record<string, Array<Record<string, number>>>;
  // Static (non-level-scaling) modifiers the skill itself adds.
  static?: Record<string, number>;
}

export interface ModRecord {
  metadata_id: string;
  name: string | null;
  // Each stat is { id, min, max } per RePoE shape, captured for engine
  // resolution of "Prefix: <mod_id>" item references.
  stats: Array<{ id: string; min: number; max: number }>;
  tags: string[];
  domain: string | null;
  generation_type: string | null;
}

export interface GameData {
  patch_version_id: number;
  patch_tag: string;
  // Passives indexed two ways for the two access paths.
  passives_by_hash: Map<number, PassiveRecord>;
  passives_by_id: Map<string, PassiveRecord>;
  // Skills + mods keyed by metadata_id (the canonical RePoE identifier).
  skills_by_metadata_id: Map<string, SkillRecord>;
  mods_by_metadata_id: Map<string, ModRecord>;
}
