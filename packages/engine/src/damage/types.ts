// Internal damage-pipeline types. These mirror the PoB calc structure so a
// reader familiar with PoB-PoE2 can map our intermediate values to theirs
// for drift debugging.
//
// Per-hit damage flows through these stages:
//
//   1. base_damage  — raw weapon (or unarmed) damage range, before mods.
//   2. flat_added   — flat damage from gear/heralds/Hollow Palm/etc.,
//                     bucketed by element type.
//   3. conversion   — % of one element converted into another at the
//                     flat layer, per PoE2 conversion rules.
//   4. increased    — additive % pool, per element (sums to 1 + total/100).
//   5. more         — multiplicative factors, per element (each its own).
//   6. effectiveness — final skill-level multiplier (PoB damage_multiplier).
//   7. crit         — attempts to crit, scaling by crit chance × crit multi.
//
// We compute per-element low/high pairs and sum at the end for "average
// hit". That matches PoB's per-element decomposition.

import type { DamageType } from "@poe2/types";

export interface DamageRange {
  min: number;
  max: number;
}

export interface PerElement<T> {
  physical: T;
  fire: T;
  cold: T;
  lightning: T;
  chaos: T;
}

export const ELEMENTS: DamageType[] = ["physical", "fire", "cold", "lightning", "chaos"];

export function emptyPerElement<T>(initial: () => T): PerElement<T> {
  return {
    physical: initial(),
    fire: initial(),
    cold: initial(),
    lightning: initial(),
    chaos: initial(),
  };
}

export function emptyRange(): DamageRange {
  return { min: 0, max: 0 };
}

export interface HitBreakdown {
  // Per-element damage range AFTER all multipliers (pre-crit, expected hit).
  per_element: PerElement<DamageRange>;
  // Combined non-crit average hit (sum of per_element averages).
  average_non_crit: number;
  // Crit chance as a fraction in [0, 1].
  crit_chance: number;
  // Crit multiplier as a multiplier (e.g. 5.29 = 5.29× non-crit damage).
  crit_multiplier: number;
  // Average hit blending crit and non-crit — what TotalDPS multiplies by speed.
  average_hit: number;
  // Attacks per second.
  attack_speed: number;
  // Combined DPS = average_hit * attack_speed * hit_chance.
  combined_dps: number;
  // Hit chance (default 100% for now).
  hit_chance: number;
  // Diagnostic: each layer's intermediate value, useful when comparing to
  // PoB's tooltip breakdown.
  layers: {
    base: PerElement<DamageRange>;
    after_flat: PerElement<DamageRange>;
    after_conversion: PerElement<DamageRange>;
    after_increased: PerElement<DamageRange>;
    after_more: PerElement<DamageRange>;
    increased_pct: PerElement<number>;
    more_factor: PerElement<number>;
  };
}
