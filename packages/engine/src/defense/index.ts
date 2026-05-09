// Top-level defense roll-up.
//
// Composes pools (life/ES/mana/armour/evasion), resistances, and EHP
// into a single DefenseResult that mirrors the @poe2/types shape.

import type { BuildInput, DefenseResult } from "@poe2/types";
import type { ModSet } from "../modifiers/types.js";
import { computeEHP } from "./ehp.js";
import { computeDefensePools } from "./pools.js";
import { computeResistances } from "./resistances.js";

export function computeDefense(
  build: BuildInput,
  mods: ModSet,
): DefenseResult {
  const pools = computeDefensePools(build, mods.entries);
  const resistances = computeResistances(mods.entries, build.assumptions);
  const ehp = computeEHP({
    life: pools.life,
    energy_shield: pools.energy_shield,
    armour: pools.armour,
    evasion: pools.evasion,
    resistances,
  });

  return {
    ehp: ehp.ehp,
    life: pools.life,
    es: pools.energy_shield,
    armour: pools.armour,
    armour_dr_pct: ehp.armour_dr_pct,
    evasion: pools.evasion,
    evasion_chance_pct: ehp.evasion_chance_pct,
    resistances: {
      fire: resistances.fire,
      cold: resistances.cold,
      lightning: resistances.lightning,
      chaos: resistances.chaos,
      fire_max: resistances.fire_max,
      cold_max: resistances.cold_max,
      lightning_max: resistances.lightning_max,
      chaos_max: resistances.chaos_max,
    },
    confidence: {
      tier: "medium",
      reason: "Phase 4 defense path; calibration constants back-solved on poison-build-1",
    },
  };
}

export type { DefensePoolResult } from "./pools.js";
export { computeDefensePools } from "./pools.js";
export { computeResistances } from "./resistances.js";
export { computeEHP } from "./ehp.js";
