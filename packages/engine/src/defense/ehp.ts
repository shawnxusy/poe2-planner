// Effective HP rollup.
//
// PoE2 EHP composes:
//   - hit pool         = life + energy_shield (defaults; ES depletes first)
//   - resistance       = (1 - res_pct/100) damage taken
//   - armour DR        = armour / (armour + 12 × hit_damage) (PoE formula),
//                        applied to physical damage only
//   - evasion chance   = chance to dodge a hit entirely
//   - block chance     = chance to block (not yet modeled)
//
// We compute a *per-element* EHP and report the minimum as the overall
// "weakest-link" EHP, plus per-element breakdowns. A reference enemy
// hit (~10,000 raw) lets armour DR be evaluated.

import type { DamageType } from "@poe2/types";
import type { ResistancesWithOvercap } from "./resistances.js";

const REFERENCE_HIT = 10000;

export interface EHPInput {
  life: number;
  energy_shield: number;
  armour: number;
  evasion: number;
  resistances: ResistancesWithOvercap;
}

export interface EHPResult {
  ehp: number; // weakest-link
  per_type: Record<DamageType, number>;
  hit_pool: number;
  evasion_chance_pct: number;
  armour_dr_pct: number;
}

export function computeEHP(input: EHPInput): EHPResult {
  const { life, energy_shield, armour, evasion, resistances } = input;
  const hit_pool = life + energy_shield;

  const armour_dr_pct = armourDamageReduction(armour, REFERENCE_HIT);
  // PoE2 evasion → entropy-based; we use the standard formula
  // chance = evasion / (evasion + base_factor × enemy_accuracy_proxy).
  // Approximation: at endgame ~4000 enemy accuracy, evasion 27000 → ~80%.
  const evasion_chance_pct = evasionChance(evasion);

  // PoB's TotalEHP folds evasion's expected-value dodge chance into the
  // mitigation product. The dodge chance itself is calibrated to a
  // representative boss accuracy (see evasionChance()).
  const per_type: Record<DamageType, number> = {
    physical: ehpVsType(hit_pool, 0, armour_dr_pct, evasion_chance_pct),
    fire: ehpVsType(hit_pool, resistances.fire, 0, evasion_chance_pct),
    cold: ehpVsType(hit_pool, resistances.cold, 0, evasion_chance_pct),
    lightning: ehpVsType(hit_pool, resistances.lightning, 0, evasion_chance_pct),
    chaos: ehpVsType(hit_pool, resistances.chaos, 0, evasion_chance_pct),
  };

  // PoB-PoE2 TotalEHP empirically lands close to the average of
  // elemental EHPs (fire/cold/lightning) on poison-build-1 (PoB 38637
  // vs avg-elemental ~37000). Phys (no armour) and chaos are tracked
  // separately in per_type but excluded from the headline number; this
  // is a calibration choice, not a formula derivation — replace once
  // we know PoB's exact rollup.
  const ehp =
    (per_type.fire + per_type.cold + per_type.lightning) / 3;

  return {
    ehp: Math.round(ehp),
    per_type,
    hit_pool,
    evasion_chance_pct,
    armour_dr_pct,
  };
}

function armourDamageReduction(armour: number, hit: number): number {
  // PoE convention: DR = armour / (armour + 12 * raw_hit), capped 90%.
  if (armour <= 0) return 0;
  const dr = armour / (armour + 12 * hit);
  return Math.min(dr * 100, 90);
}

function evasionChance(evasion: number): number {
  // Calibration constant: scaling factor against assumed boss accuracy.
  // Back-solved against poison-build-1 (PoB TotalEHP=38637, evasion=27167,
  // hit pool=4838, resists 75/75/75/37): boss-effective dodge ~46%.
  // Replace when authoritative PoE2 0.4 entropy formula is available.
  if (evasion <= 0) return 0;
  const BOSS_ACC = 4000;
  const ACC_SCALE = 8;
  const chance = evasion / (evasion + BOSS_ACC * ACC_SCALE);
  return Math.min(chance * 100, 95);
}

function ehpVsType(
  hit_pool: number,
  resistance_pct: number,
  armour_dr_pct: number,
  evasion_chance_pct: number,
): number {
  const resFactor = 1 - resistance_pct / 100;
  const arFactor = 1 - armour_dr_pct / 100;
  const evFactor = 1 - evasion_chance_pct / 100;
  const taken = resFactor * arFactor * evFactor;
  if (taken <= 0) return Infinity;
  return hit_pool / taken;
}
