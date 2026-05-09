// Assigns each ModEntry a ModScope (hit / dot / ailment / defense / aura /
// utility / minion / global / both) so calc paths can pull just the mods
// that affect them.
//
// Why this is its own pass: a single mod ("X% increased Cold Damage") can
// apply to BOTH hit and DoT scopes by default in PoE. The PoB rule of
// thumb is:
//   - Generic damage modifiers → "both" (hit AND ailment)
//   - Tagged with "spell"/"attack" → hit only (it's a hit-source modifier)
//   - Tagged with "dot"/"ailment" or target is *_damage with damage-over-time
//     phrasing → dot
//   - Tagged with "minion" → minion
//   - Tagged with "aura" → aura
//   - Defense targets (life, ES, resistance) → defense
//   - Anything else (rarity, movement speed) → utility
//
// We never overwrite an existing non-global scope (rare paths set scope
// in advance); otherwise we derive from tags + target.

import type { ModEntry, ModScope, ModTarget } from "./types.js";

const DEFENSE_TARGETS = new Set<ModTarget>([
  "life",
  "energy_shield",
  "mana",
  "armour",
  "evasion",
  "fire_resistance",
  "cold_resistance",
  "lightning_resistance",
  "chaos_resistance",
  "all_elemental_resistance",
  "all_resistance",
  "max_fire_resistance",
  "max_cold_resistance",
  "max_lightning_resistance",
  "max_chaos_resistance",
  "block_chance",
  "max_block_chance",
  "deflection_rating",
  "stun_threshold",
]);

const AILMENT_TARGETS = new Set<ModTarget>([
  "ailment_magnitude",
  "non_damaging_ailment_magnitude",
  "ailment_duration",
  "elemental_ailment_duration",
  "poison_damage",
  "ignite_damage",
  "bleed_damage",
  "chance_to_poison_on_hit",
  "chance_to_ignite_on_hit",
  "chance_to_bleed_on_hit",
  "chance_to_freeze",
  "chance_to_shock",
]);

const UTILITY_TARGETS = new Set<ModTarget>([
  "movement_speed",
  "rarity_of_items",
  "spirit",
  "accuracy_rating",
  "cooldown_recovery_rate",
  "cost_efficiency",
  "projectile_speed",
]);

const ATTRIBUTE_TARGETS = new Set<ModTarget>([
  "strength",
  "dexterity",
  "intelligence",
  "all_attributes",
]);

function deriveScope(mod: ModEntry): ModScope {
  // Operator-driven scopes first (TRIGGER / UNKNOWN don't fit the calc).
  if (mod.operator === "TRIGGER" || mod.operator === "UNKNOWN") {
    return "utility";
  }

  // Tag-based assignments take precedence over target-based ones because
  // a single tag on a passive node usually narrows scope.
  const tags = new Set(mod.tags.map((t) => t.toLowerCase()));
  if (tags.has("minion")) return "minion";
  if (tags.has("aura")) return "aura";
  if (tags.has("dot") || tags.has("damage_over_time")) return "dot";
  if (tags.has("ailment")) return "ailment";

  // Target-based fallbacks.
  if (DEFENSE_TARGETS.has(mod.target)) return "defense";
  if (AILMENT_TARGETS.has(mod.target)) return "ailment";
  if (UTILITY_TARGETS.has(mod.target)) return "utility";
  if (ATTRIBUTE_TARGETS.has(mod.target)) return "global"; // attributes apply broadly

  // For damage targets without a hit/spell tag, the safe default is "both"
  // — the mod can affect a hit AND any ailment seeded from that hit.
  if (
    mod.target === "physical_damage" ||
    mod.target === "fire_damage" ||
    mod.target === "cold_damage" ||
    mod.target === "lightning_damage" ||
    mod.target === "chaos_damage" ||
    mod.target === "elemental_damage" ||
    mod.target === "any_damage"
  ) {
    if (tags.has("spell") || tags.has("attack")) return "hit";
    return "both";
  }

  if (mod.target === "spell_damage" || mod.target === "attack_damage") return "hit";
  if (mod.target === "projectile_damage" || mod.target === "area_damage") return "hit";

  // Crit/speed are hit-only (DoTs don't crit by default in PoE2).
  if (
    mod.target === "crit_chance" ||
    mod.target === "crit_damage" ||
    mod.target === "attack_speed" ||
    mod.target === "cast_speed" ||
    mod.target === "skill_speed"
  ) {
    return "hit";
  }

  // Skill-level grants apply globally to the named skill type.
  if (
    mod.target === "level_of_melee_skills" ||
    mod.target === "level_of_projectile_skills" ||
    mod.target === "level_of_spell_skills" ||
    mod.target === "level_of_minion_skills" ||
    mod.target === "level_of_all_skills"
  ) {
    return "global";
  }

  return "utility";
}

export function categorize(entries: ModEntry[]): ModEntry[] {
  return entries.map((m) => {
    // If the resolver already assigned a non-default scope, keep it.
    if (m.scope !== "global") return m;
    return { ...m, scope: deriveScope(m) };
  });
}

// Helper: pull all entries matching a given scope (or scopes) and target.
export function selectMods(
  entries: ModEntry[],
  scopes: ModScope | ModScope[],
  targets?: ModTarget | ModTarget[],
): ModEntry[] {
  const scopeSet = new Set(Array.isArray(scopes) ? scopes : [scopes]);
  const targetSet = targets
    ? new Set(Array.isArray(targets) ? targets : [targets])
    : null;
  return entries.filter(
    (m) => scopeSet.has(m.scope) && (targetSet === null || targetSet.has(m.target)),
  );
}
