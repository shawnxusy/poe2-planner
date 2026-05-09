// RePoE stat_id → ModEntry shape mapping.
//
// Passives store their effect as a list of `stat_ids` with numeric values
// (e.g. `cold_damage_+%: 10`). RePoE's stat_ids are *much* more reliable to
// match than the rendered description string, so we drive the passive part
// of the resolver off this table directly.
//
// Coverage strategy: handle the common stat IDs that appear across hit,
// crit, life/ES, and resistance builds. Stats we don't recognise produce a
// single UNKNOWN entry so calc paths can ignore them while we keep the
// telemetry for drift analysis.
//
// Naming convention in RePoE:
//   - `*_+%`        → INCREASED (additive % pool)
//   - `*_+`         → FLAT (additive constant)
//   - `base_*`      → FLAT
//   - `*_-%`        → REDUCED (additive % pool, negative)
//   - `keystone_*`  → keystone marker, handled by special-case code
//
// The mapping returns null for stats we deliberately ignore (UI display,
// keystones we resolve elsewhere) so the resolver can treat null as "skip
// without warning".

import type { ModEntry, ModOperator, ModSource, ModTarget } from "./types.js";

interface StatMapping {
  operator: ModOperator;
  target: ModTarget;
  tags?: string[];
  // Some stats need value transformation (e.g., permyriad → percent).
  scale?: number;
}

// Direct stat_id → mapping table. Entries whose value should be ignored
// outright map to null below.
const TABLE: Record<string, StatMapping> = {
  // --- Damage (increased) ---
  "physical_damage_+%": { operator: "INCREASED", target: "physical_damage" },
  "fire_damage_+%": { operator: "INCREASED", target: "fire_damage" },
  "cold_damage_+%": { operator: "INCREASED", target: "cold_damage" },
  "lightning_damage_+%": { operator: "INCREASED", target: "lightning_damage" },
  "chaos_damage_+%": { operator: "INCREASED", target: "chaos_damage" },
  "elemental_damage_+%": { operator: "INCREASED", target: "elemental_damage" },
  "spell_damage_+%": { operator: "INCREASED", target: "spell_damage" },
  "attack_damage_+%": { operator: "INCREASED", target: "attack_damage", tags: ["attack"] },
  "projectile_damage_+%": { operator: "INCREASED", target: "projectile_damage" },
  "area_damage_+%": { operator: "INCREASED", target: "area_damage" },
  "melee_damage_+%": { operator: "INCREASED", target: "attack_damage", tags: ["attack", "melee"] },
  "damage_+%": { operator: "INCREASED", target: "any_damage" },

  // --- Speed ---
  "attack_speed_+%": { operator: "INCREASED", target: "attack_speed", tags: ["attack"] },
  "cast_speed_+%": { operator: "INCREASED", target: "cast_speed", tags: ["spell"] },
  "skill_speed_+%": { operator: "INCREASED", target: "skill_speed" },
  "attack_and_cast_speed_+%": { operator: "INCREASED", target: "skill_speed" },
  "base_movement_velocity_+%": { operator: "INCREASED", target: "movement_speed" },
  "movement_velocity_+%": { operator: "INCREASED", target: "movement_speed" },

  // --- Crit ---
  "critical_strike_chance_+%": { operator: "INCREASED", target: "crit_chance" },
  "attack_critical_strike_chance_+%": { operator: "INCREASED", target: "crit_chance", tags: ["attack"] },
  "spell_critical_strike_chance_+%": { operator: "INCREASED", target: "crit_chance", tags: ["spell"] },
  "base_critical_strike_multiplier_+": { operator: "FLAT", target: "crit_damage" },
  "attack_critical_strike_multiplier_+": { operator: "FLAT", target: "crit_damage", tags: ["attack"] },
  "spell_critical_strike_multiplier_+": { operator: "FLAT", target: "crit_damage", tags: ["spell"] },
  // permyriad → percent (1/100): a "+100 permyriad" is +1% additional crit chance.
  "attack_additional_critical_strike_chance_permyriad": {
    operator: "FLAT",
    target: "crit_chance",
    tags: ["attack"],
    scale: 1 / 100,
  },

  // --- Defenses (life/ES/mana/armour/evasion) ---
  "base_maximum_life": { operator: "FLAT", target: "life" },
  "maximum_life_+%": { operator: "INCREASED", target: "life" },
  "base_maximum_energy_shield": { operator: "FLAT", target: "energy_shield" },
  "maximum_energy_shield_+%": { operator: "INCREASED", target: "energy_shield" },
  "base_maximum_mana": { operator: "FLAT", target: "mana" },
  "maximum_mana_+%": { operator: "INCREASED", target: "mana" },
  "armour_+%": { operator: "INCREASED", target: "armour" },
  "evasion_rating_+%": { operator: "INCREASED", target: "evasion" },
  "base_evasion_rating": { operator: "FLAT", target: "evasion" },

  // --- Resistances ---
  "base_fire_damage_resistance_%": { operator: "FLAT", target: "fire_resistance" },
  "base_cold_damage_resistance_%": { operator: "FLAT", target: "cold_resistance" },
  "base_lightning_damage_resistance_%": { operator: "FLAT", target: "lightning_resistance" },
  "base_chaos_damage_resistance_%": { operator: "FLAT", target: "chaos_resistance" },
  "base_resist_all_elements_%": { operator: "FLAT", target: "all_elemental_resistance" },
  "fire_damage_resistance_maximum_%": { operator: "FLAT", target: "max_fire_resistance" },
  "cold_damage_resistance_maximum_%": { operator: "FLAT", target: "max_cold_resistance" },
  "lightning_damage_resistance_maximum_%": { operator: "FLAT", target: "max_lightning_resistance" },
  "chaos_damage_resistance_maximum_%": { operator: "FLAT", target: "max_chaos_resistance" },

  // --- Attributes ---
  "base_strength": { operator: "FLAT", target: "strength" },
  "base_dexterity": { operator: "FLAT", target: "dexterity" },
  "base_intelligence": { operator: "FLAT", target: "intelligence" },
  "additional_strength": { operator: "FLAT", target: "strength" },
  "additional_dexterity": { operator: "FLAT", target: "dexterity" },
  "additional_intelligence": { operator: "FLAT", target: "intelligence" },
  "additional_all_attributes": { operator: "FLAT", target: "all_attributes" },
  "strength_+%": { operator: "INCREASED", target: "strength" },
  "dexterity_+%": { operator: "INCREASED", target: "dexterity" },
  "intelligence_+%": { operator: "INCREASED", target: "intelligence" },
  "all_attributes_+%": { operator: "INCREASED", target: "all_attributes" },

  // --- Misc ---
  "base_accuracy_rating": { operator: "FLAT", target: "accuracy_rating" },
  "accuracy_rating_+%": { operator: "INCREASED", target: "accuracy_rating" },
  "spirit_+": { operator: "FLAT", target: "spirit" },
  "base_spirit": { operator: "FLAT", target: "spirit" },
  "stun_threshold_+%": { operator: "INCREASED", target: "stun_threshold" },
  "base_stun_threshold_+": { operator: "FLAT", target: "stun_threshold" },

  // --- Ailments ---
  "damaging_ailment_magnitude_+%": { operator: "INCREASED", target: "ailment_magnitude" },
  "non_damaging_ailment_magnitude_+%": {
    operator: "INCREASED",
    target: "non_damaging_ailment_magnitude",
  },
  "ailment_duration_+%": { operator: "INCREASED", target: "ailment_duration" },
  "elemental_ailment_duration_+%": {
    operator: "INCREASED",
    target: "elemental_ailment_duration",
  },
  "poison_damage_+%": { operator: "INCREASED", target: "poison_damage", tags: ["dot", "poison"] },
  "ignite_damage_+%": { operator: "INCREASED", target: "ignite_damage", tags: ["dot", "ignite"] },
  "bleed_damage_+%": { operator: "INCREASED", target: "bleed_damage", tags: ["dot", "bleed"] },
  "shock_effect_+%": { operator: "INCREASED", target: "ailment_magnitude", tags: ["shock"] },
  "freeze_threshold_+%": { operator: "INCREASED", target: "ailment_magnitude", tags: ["freeze"] },

  // Compound stats: dex+int / str+dex etc. These two-attribute stats apply
  // their value to BOTH attributes. The resolver expands this entry.
  "base_dexterity_and_intelligence": {
    operator: "FLAT",
    target: "all_attributes", // resolver-side specialisation below
  },
  "base_strength_and_dexterity": {
    operator: "FLAT",
    target: "all_attributes",
  },
  "base_strength_and_intelligence": {
    operator: "FLAT",
    target: "all_attributes",
  },
};

// Stats deliberately ignored (cosmetic, not load-bearing for hit/EHP, or
// resolved via keystone pathway). Returning a sentinel here lets the
// resolver skip them without an UNKNOWN warning entry.
const IGNORED = new Set<string>([
  "display_passive_attribute_text",
  // Keystone markers — handled separately if/when we add keystone effects.
  "keystone_chaos_inoculation",
  "keystone_hollow_palm_technique",
  "keystone_druidic_rage",
  // Conditional / mechanic-flag stats we'll layer in when needed.
  "energy_shield_delay_-%",
  "energy_shield_recharge_rate_+%",
  "mana_regeneration_rate_+%",
  "base_mana_leech_amount_+%",
  "base_chance_to_daze_%",
  "cannot_gain_spirit_from_equipment",
  "critical_strikes_ignore_positive_elemental_resistances",
]);

// Conditional damage stats — they pool into the ammo's INCREASED bucket
// only when the configured assumption holds. The resolver inspects these
// at apply time; for now we route them as INCREASED with a flag tag the
// hit-damage path can opt into.
const CONDITIONAL: Record<string, { target: ModTarget; condition_tag: string; tags?: string[] }> = {
  "damage_+%_for_4_seconds_on_crit": { target: "any_damage", condition_tag: "after_crit" },
  "damage_+%_while_affected_by_a_herald": { target: "any_damage", condition_tag: "herald_active" },
  "damage_+%_if_have_crit_in_past_8_seconds": {
    target: "any_damage",
    condition_tag: "after_crit",
  },
  "elemental_damage_+%_if_enemy_shocked_recently": {
    target: "elemental_damage",
    condition_tag: "enemy_shocked",
  },
  "elemental_damage_+%_if_enemy_chilled_recently": {
    target: "elemental_damage",
    condition_tag: "enemy_chilled",
  },
  "damage_+%_vs_frozen_enemies": { target: "any_damage", condition_tag: "vs_frozen" },
  "attack_damage_+%_when_on_full_life": {
    target: "attack_damage",
    condition_tag: "full_life",
    tags: ["attack"],
  },
  "attack_damage_+%_when_on_low_life": {
    target: "attack_damage",
    condition_tag: "low_life",
    tags: ["attack"],
  },
  "attack_damage_+%_vs_rare_or_unique_enemy": {
    target: "attack_damage",
    condition_tag: "vs_rare_or_unique",
    tags: ["attack"],
  },
  "cold_damage_+%_while_affected_by_herald_of_ice": {
    target: "cold_damage",
    condition_tag: "herald_of_ice",
  },
  "fire_damage_+%_while_affected_by_herald_of_ash": {
    target: "fire_damage",
    condition_tag: "herald_of_ash",
  },
  "lightning_damage_+%_while_affected_by_herald_of_thunder": {
    target: "lightning_damage",
    condition_tag: "herald_of_thunder",
  },
  "critical_strike_multiplier_+_if_have_dealt_non_crit_recently": {
    target: "crit_damage",
    condition_tag: "after_non_crit",
  },
  "hit_damage_freeze_multiplier_+%": {
    target: "any_damage",
    condition_tag: "vs_frozen",
  },
};

function expandCompound(
  stat_id: string,
  value: number,
  source: ModSource,
  baseTags: string[],
): ModEntry[] | null {
  // Two-attribute stats split into two FLATs.
  const PAIRS: Record<string, [ModTarget, ModTarget]> = {
    base_dexterity_and_intelligence: ["dexterity", "intelligence"],
    base_strength_and_dexterity: ["strength", "dexterity"],
    base_strength_and_intelligence: ["strength", "intelligence"],
  };
  const pair = PAIRS[stat_id];
  if (!pair) return null;
  return pair.map((target) => ({
    operator: "FLAT",
    target,
    value,
    tags: baseTags,
    source_text: `${stat_id}=${value}`,
    source,
    scope: "global",
  }));
}

export function statToMods(
  stat_id: string,
  value: number,
  source: ModSource,
): ModEntry[] | null {
  if (IGNORED.has(stat_id)) return [];

  const compound = expandCompound(stat_id, value, source, []);
  if (compound) return compound;

  const cond = CONDITIONAL[stat_id];
  if (cond) {
    return [
      {
        operator: "INCREASED",
        target: cond.target,
        value,
        tags: [...(cond.tags ?? []), "conditional", cond.condition_tag],
        source_text: `${stat_id}=${value}`,
        source,
        scope: "global",
      },
    ];
  }

  const m = TABLE[stat_id];
  if (m) {
    return [
      {
        operator: m.operator,
        target: m.target,
        value: m.scale ? value * m.scale : value,
        tags: m.tags ?? [],
        source_text: `${stat_id}=${value}`,
        source,
        scope: "global",
      },
    ];
  }

  // Unknown stat — surface as UNKNOWN so we can audit drift.
  return null;
}
