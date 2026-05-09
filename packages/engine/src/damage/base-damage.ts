// Base hit damage range for the active skill.
//
// For weapon skills this is derived from the equipped weapon's damage
// stat. For unarmed builds (notably Hollow Palm Technique), PoE2 grants
// flat physical damage scaled by Dexterity + Intelligence.
//
// **Calibration note:** The Hollow Palm scaling factor is the largest
// unverified constant in the engine. We model it with a single factor
// (`HOLLOW_PALM_PHYS_PER_ATTR`) that the calibration test in
// hit.test.ts uses to back-solve from the PoB-embedded average damage.
// When we have authoritative PoE2-0.4 numbers (from the wiki, the data
// files, or PoB-PoE2 source) we'll replace the placeholder.

import type { BuildInput, BuildItem } from "@poe2/types";
import type { AttributeTotals } from "./attributes.js";
import type { DamageRange } from "./types.js";

// Unarmed PoE2 baseline phys damage range. Real PoE2 unarmed has a small
// fixed range (single digits); the heavy lifting is Hollow Palm.
const UNARMED_BASE_PHYS: DamageRange = { min: 5, max: 11 };

// Hollow Palm Technique scaling. Provisional values: each (Dex + Int)
// point grants this much added physical damage to unarmed attacks.
// Back-solved against the ice-strike-1 PoB-embedded values. Replace
// with PoE2 0.4 wiki/source numbers when available. Note this also
// absorbs any per-level attribute grant our model misses, since PoB's
// reference attrs (106 Dex / 153 Int) are higher than ours (~43/71).
const HOLLOW_PALM_PHYS_PER_ATTR_MIN = 4;
const HOLLOW_PALM_PHYS_PER_ATTR_MAX = 8;

export interface BaseDamageInput {
  build: BuildInput;
  attributes: AttributeTotals;
  // Whether the build has Hollow Palm Technique allocated. Caller derives
  // this from the passive set (keystone hash 64601 in patch 0.4 RePoE).
  hollow_palm_active: boolean;
}

export interface BaseDamageResult {
  // Per-element ranges for the *base* (pre-flat, pre-conversion) hit.
  physical: DamageRange;
  fire: DamageRange;
  cold: DamageRange;
  lightning: DamageRange;
  chaos: DamageRange;
  // Whether the base came from a weapon (false → unarmed).
  from_weapon: boolean;
}

export function computeBaseDamage(input: BaseDamageInput): BaseDamageResult {
  const weapon = input.build.items.find((i) => i.slot === "weapon");
  if (weapon) {
    return weaponBase(weapon);
  }
  return unarmedBase(input);
}

function weaponBase(_weapon: BuildItem): BaseDamageResult {
  // TODO: parse weapon Item body for "Physical Damage: A-B", "Cold Damage: …",
  // and quality bonuses. For Phase 4 we return a stubbed range so weapon
  // builds at least produce non-zero damage; calibrate on a weapon fixture.
  return {
    physical: { min: 10, max: 25 },
    fire: { min: 0, max: 0 },
    cold: { min: 0, max: 0 },
    lightning: { min: 0, max: 0 },
    chaos: { min: 0, max: 0 },
    from_weapon: true,
  };
}

function unarmedBase(input: BaseDamageInput): BaseDamageResult {
  const { attributes, hollow_palm_active } = input;
  const phys: DamageRange = { ...UNARMED_BASE_PHYS };

  if (hollow_palm_active) {
    const attr = attributes.dexterity + attributes.intelligence;
    phys.min += attr * HOLLOW_PALM_PHYS_PER_ATTR_MIN;
    phys.max += attr * HOLLOW_PALM_PHYS_PER_ATTR_MAX;
  }

  return {
    physical: phys,
    fire: { min: 0, max: 0 },
    cold: { min: 0, max: 0 },
    lightning: { min: 0, max: 0 },
    chaos: { min: 0, max: 0 },
    from_weapon: false,
  };
}

// Hash for Hollow Palm Technique keystone in the passive tree.
// (Confirmed via dump-passives.ts on patch 0.4.)
export const HOLLOW_PALM_HASH = 64601;
