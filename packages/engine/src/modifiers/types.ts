// The modifier system is the engine's central data structure. Every mod
// from a passive node, gear affix, support gem, or aura ends up here as
// one or more typed entries. Damage and defense paths consume the
// resulting accumulator.
//
// Key invariants:
//   - INCREASED entries pool additively per (target, tag-set).
//   - MORE entries multiply independently (each entry is its own factor).
//   - FLAT entries pool additively per (target, tag-set).
//   - Hit and DoT modifier pools are SEPARATE — never sum. This is the
//     #1 source of drift vs PoB if conflated.

// What a modifier targets. Coarse categories first; we'll expand to more
// stat IDs as we add edge cases. "any_damage" is the broadest match —
// "increased Damage" with no qualifier.
export type ModTarget =
  // Damage
  | "physical_damage"
  | "fire_damage"
  | "cold_damage"
  | "lightning_damage"
  | "chaos_damage"
  | "elemental_damage"
  | "spell_damage"
  | "attack_damage"
  | "projectile_damage"
  | "area_damage"
  | "any_damage"
  // Speed
  | "attack_speed"
  | "cast_speed"
  | "movement_speed"
  // Crit
  | "crit_chance"
  | "crit_damage"
  // Defenses
  | "life"
  | "energy_shield"
  | "mana"
  | "armour"
  | "evasion"
  | "fire_resistance"
  | "cold_resistance"
  | "lightning_resistance"
  | "chaos_resistance"
  | "all_elemental_resistance"
  | "all_resistance"
  | "max_fire_resistance"
  | "max_cold_resistance"
  | "max_lightning_resistance"
  | "max_chaos_resistance"
  // Attributes
  | "strength"
  | "dexterity"
  | "intelligence"
  | "all_attributes"
  // Misc / fallback
  | "accuracy_rating"
  | "stun_threshold"
  | "rarity_of_items"
  | "block_chance"
  | "max_block_chance"
  | "spirit"
  // Ailment-specific
  | "ailment_magnitude"
  | "non_damaging_ailment_magnitude"
  | "ailment_duration"
  | "elemental_ailment_duration"
  | "poison_damage"
  | "ignite_damage"
  | "bleed_damage"
  | "skill_speed"
  // Skill-level grants
  | "level_of_melee_skills"
  | "level_of_projectile_skills"
  | "level_of_spell_skills"
  | "level_of_minion_skills"
  | "level_of_all_skills"
  // PoE2-specific defenses
  | "deflection_rating"
  // Chance-on-X
  | "chance_to_poison_on_hit"
  | "chance_to_ignite_on_hit"
  | "chance_to_bleed_on_hit"
  | "chance_to_freeze"
  | "chance_to_shock"
  // Cooldown / cost
  | "cooldown_recovery_rate"
  | "cost_efficiency"
  | "projectile_speed";

export type ModOperator =
  // X% increased Y → ADDITIVE-INCREASED pool
  | "INCREASED"
  // X% more Y → MULTIPLICATIVE pool
  | "MORE"
  // X% reduced Y → ADDITIVE-INCREASED pool with negative sign
  | "REDUCED"
  // X% less Y → MULTIPLICATIVE pool with (1 - X/100)
  | "LESS"
  // +N to Y or -N to Y → FLAT pool
  | "FLAT"
  // Adds N to M Z damage → FLAT damage range (lo, hi captured separately)
  | "FLAT_RANGE"
  // "X% chance to Y on Hit" — calc path applies the chance per hit.
  | "CHANCE"
  // Override a value (rare; e.g., "Critical Strike Chance is 100%")
  | "OVERRIDE"
  // Triggered effect: "When you kill X, gain Y…". The categorizer keeps
  // these for build summaries but no damage path consumes them yet.
  | "TRIGGER"
  // Unknown/unmatched — kept for diagnostics, ignored by calc paths
  | "UNKNOWN";

// Damage scope: hit modifiers vs DoT modifiers vs both (the rare case).
// Resolver assigns this when categorizing.
export type ModScope = "hit" | "dot" | "ailment" | "both" | "global" | "minion" | "aura" | "defense" | "utility";

export interface ModEntry {
  // Required fields
  operator: ModOperator;
  target: ModTarget;
  value: number;
  // For FLAT_RANGE only — value carries the LOW, value_high the HIGH.
  value_high?: number;
  // PoB tags from the source (e.g., "fire", "spell", "attack"). Used by
  // the resolver to match conditional applicability.
  tags: string[];
  // Engine-assigned scope after categorization.
  scope: ModScope;
  // Original mod text for debugging + low-confidence fallback rendering.
  source_text: string;
  // Where this mod came from — useful for tracing drift back to a node/item.
  source: ModSource;
}

export interface ModSource {
  kind: "passive" | "implicit" | "explicit" | "support" | "skill_base" | "ascendancy" | "config";
  // Free-form identifier. For passives: hash; for items: slot+affix index;
  // for supports: support_id; for skill_base: skill_id+level.
  ref?: string;
}

// The flattened modifier set produced by the resolver. Calc paths consume
// this directly — they never re-walk the source data.
export interface ModSet {
  entries: ModEntry[];
}

export function emptyModSet(): ModSet {
  return { entries: [] };
}

export function pushMod(set: ModSet, mod: ModEntry): void {
  set.entries.push(mod);
}
