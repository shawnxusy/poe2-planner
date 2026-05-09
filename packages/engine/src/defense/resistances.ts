// Per-element resistance totals.
//
// PoE rule: resistances start at 0 (PoE2 doesn't apply campaign penalty in
// the build-stats view), accumulate FLAT mods (additive % values like
// "+30% to Cold Resistance"), and clamp at the per-element max (default
// 75). Maxes are themselves modifiable: "+5% to maximum Cold Resistance"
// pushes the cap, etc.

import type { CalcAssumptions, Resistances } from "@poe2/types";
import { DEFAULT_ENEMY_RESISTANCES } from "@poe2/types";
import { isModActive } from "../modifiers/conditions.js";
import type { ModEntry, ModTarget } from "../modifiers/types.js";

export interface ResistancesWithOvercap extends Resistances {
  // PoB displays "OverCap" — value above max. Useful when content (maps,
  // bosses) reduces resistances; here we expose for diagnostics only.
  fire_overcap: number;
  cold_overcap: number;
  lightning_overcap: number;
  chaos_overcap: number;
}

export function computeResistances(
  mods: ModEntry[],
  assumptions: CalcAssumptions,
): ResistancesWithOvercap {
  const flat = {
    fire: 0,
    cold: 0,
    lightning: 0,
    chaos: 0,
    fire_max: 75,
    cold_max: 75,
    lightning_max: 75,
    chaos_max: 75,
  };

  for (const m of mods) {
    if (m.scope === "minion" || m.scope === "ailment" || m.scope === "dot") continue;
    if (!isModActive(m, assumptions)) continue;
    if (m.operator !== "FLAT") continue;
    addFlatToResistance(flat, m.target, m.value);
  }

  const fire_total = flat.fire;
  const cold_total = flat.cold;
  const lightning_total = flat.lightning;
  const chaos_total = flat.chaos;

  return {
    fire: Math.min(fire_total, flat.fire_max),
    cold: Math.min(cold_total, flat.cold_max),
    lightning: Math.min(lightning_total, flat.lightning_max),
    chaos: Math.min(chaos_total, flat.chaos_max),
    fire_max: flat.fire_max,
    cold_max: flat.cold_max,
    lightning_max: flat.lightning_max,
    chaos_max: flat.chaos_max,
    fire_overcap: Math.max(0, fire_total - flat.fire_max),
    cold_overcap: Math.max(0, cold_total - flat.cold_max),
    lightning_overcap: Math.max(0, lightning_total - flat.lightning_max),
    chaos_overcap: Math.max(0, chaos_total - flat.chaos_max),
  };
}

interface ResistAcc {
  fire: number;
  cold: number;
  lightning: number;
  chaos: number;
  fire_max: number;
  cold_max: number;
  lightning_max: number;
  chaos_max: number;
}

function addFlatToResistance(acc: ResistAcc, target: ModTarget, value: number): void {
  switch (target) {
    case "fire_resistance":
      acc.fire += value;
      return;
    case "cold_resistance":
      acc.cold += value;
      return;
    case "lightning_resistance":
      acc.lightning += value;
      return;
    case "chaos_resistance":
      acc.chaos += value;
      return;
    case "all_elemental_resistance":
      acc.fire += value;
      acc.cold += value;
      acc.lightning += value;
      return;
    case "all_resistance":
      acc.fire += value;
      acc.cold += value;
      acc.lightning += value;
      acc.chaos += value;
      return;
    case "max_fire_resistance":
      acc.fire_max += value;
      return;
    case "max_cold_resistance":
      acc.cold_max += value;
      return;
    case "max_lightning_resistance":
      acc.lightning_max += value;
      return;
    case "max_chaos_resistance":
      acc.chaos_max += value;
      return;
    default:
      return;
  }
}

// Default endgame enemy resistances — re-export so the EHP path can pull
// them when no per-build override exists.
export { DEFAULT_ENEMY_RESISTANCES };
