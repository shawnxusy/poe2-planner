// Per-element INCREASED + MORE pool aggregation.
//
// PoE2 keeps a single additive "increased" bucket and a multiplicative
// "more" bucket, but each is filtered by the mod's target. "X% increased
// Cold Damage" counts toward cold; "X% increased Damage" (any_damage)
// counts toward every element. Same for MORE.

import type { CalcAssumptions, DamageType } from "@poe2/types";
import { isModActive } from "../modifiers/conditions.js";
import type { ModEntry, ModTarget } from "../modifiers/types.js";
import type { PerElement } from "./types.js";
import { emptyPerElement } from "./types.js";

// Map a mod's target onto the elements it affects. Returns null when the
// target isn't damage-related.
function affectedElements(target: ModTarget): DamageType[] | null {
  switch (target) {
    case "physical_damage":
      return ["physical"];
    case "fire_damage":
      return ["fire"];
    case "cold_damage":
      return ["cold"];
    case "lightning_damage":
      return ["lightning"];
    case "chaos_damage":
      return ["chaos"];
    case "elemental_damage":
      return ["fire", "cold", "lightning"];
    case "any_damage":
    case "attack_damage":
    case "spell_damage":
    case "projectile_damage":
    case "area_damage":
      return ["physical", "fire", "cold", "lightning", "chaos"];
    default:
      return null;
  }
}

export interface DamagePool {
  increased: PerElement<number>; // sum of % increased per element
  more: PerElement<number>; // product (1 + v/100) folded as a final factor
}

export function computeDamagePool(
  mods: ModEntry[],
  assumptions: CalcAssumptions,
  options: { skill_tags?: string[] } = {},
): DamagePool {
  const skillTags = new Set((options.skill_tags ?? []).map((t) => t.toLowerCase()));
  const increased = emptyPerElement(() => 0);
  const moreFactors = emptyPerElement(() => 1);

  for (const m of mods) {
    if (m.scope === "minion" || m.scope === "ailment" || m.scope === "dot") continue;
    if (!isModActive(m, assumptions)) continue;
    if (m.tags.includes("conversion")) continue;
    // Skip mods that target a skill tag the active skill doesn't have. E.g.
    // "spell_damage" mods don't apply to attacks; "projectile_damage"
    // doesn't apply to a melee strike.
    if (!targetMatchesSkill(m.target, m.tags, skillTags)) continue;

    const elements = affectedElements(m.target);
    if (!elements) continue;

    if (m.operator === "INCREASED") {
      for (const e of elements) increased[e] += m.value;
    } else if (m.operator === "REDUCED") {
      for (const e of elements) increased[e] -= m.value;
    } else if (m.operator === "MORE") {
      for (const e of elements) moreFactors[e] *= 1 + m.value / 100;
    } else if (m.operator === "LESS") {
      for (const e of elements) moreFactors[e] *= 1 - m.value / 100;
    }
  }

  return { increased, more: moreFactors };
}

// Skill-tag gating for damage mods. Returns true if the mod is compatible
// with the active skill's tag set.
function targetMatchesSkill(
  target: ModTarget,
  modTags: string[],
  skillTags: Set<string>,
): boolean {
  // Direct skill-type targets check the skill's tag set.
  if (target === "spell_damage") return skillTags.has("spell");
  if (target === "attack_damage") return skillTags.has("attack");
  if (target === "projectile_damage") return skillTags.has("projectile");
  if (target === "area_damage") return skillTags.has("area");

  // Mod tags can also gate (e.g. a passive tagged "spell" still won't apply
  // to an attack). We're conservative: an "attack"-tagged mod blocks on a
  // skill without "attack", same for "spell".
  const modTagSet = new Set(modTags.map((t) => t.toLowerCase()));
  if (modTagSet.has("spell") && !skillTags.has("spell")) return false;
  if (modTagSet.has("attack") && !skillTags.has("attack")) return false;
  if (modTagSet.has("melee") && !skillTags.has("melee")) return false;
  return true;
}
