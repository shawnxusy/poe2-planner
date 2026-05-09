// Conditional-modifier gating.
//
// Many mods are tagged "conditional" plus a specific tag like
// "after_crit" / "vs_frozen" / "herald_of_ice". The damage paths apply
// such mods only when the build's active condition/herald set covers the
// tagged condition.
//
// `isModActive(mod, assumptions)` returns true when:
//   - the mod has no "conditional" tag (always active), OR
//   - every conditional sub-tag on the mod appears in the active set.
//
// This single check keeps the calc paths free of per-tag knowledge.

import type { CalcAssumptions } from "@poe2/types";
import type { ModEntry } from "./types.js";

const CONDITION_RECOGNISED = new Set<string>([
  "after_crit",
  "after_non_crit",
  "vs_frozen",
  "vs_rare_or_unique",
  "enemy_shocked",
  "enemy_chilled",
  "full_life",
  "low_life",
  "herald_active",
  "herald_of_ice",
  "herald_of_ash",
  "herald_of_thunder",
  "non_final_strike",
]);

export function isModActive(mod: ModEntry, assumptions: CalcAssumptions): boolean {
  if (!mod.tags.includes("conditional")) return true;

  const active = new Set<string>([
    ...assumptions.conditions,
    ...assumptions.heralds,
  ]);

  for (const tag of mod.tags) {
    if (!CONDITION_RECOGNISED.has(tag)) continue;
    if (!active.has(tag)) return false;
  }
  return true;
}
