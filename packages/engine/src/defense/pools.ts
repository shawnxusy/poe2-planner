// Life / Energy Shield / Mana / Armour / Evasion totals.
//
// Each pool follows the same shape:
//   total = (base_class + per_level_grant + flat_from_mods) × (1 + sum_increased / 100) × Π more_factors
//
// Per-class baselines and per-level grants are calibration constants. As
// with the hit-damage path, exact PoE2 0.4 numbers aren't in our data
// files; we back-solve against the poison-build-1 fixture (Ranger lvl 98,
// PoB-embedded Life=1644, ES=3194, Evasion=27167, Mana=699).

import type { BuildInput, CalcAssumptions } from "@poe2/types";
import { isModActive } from "../modifiers/conditions.js";
import type { ModEntry, ModTarget } from "../modifiers/types.js";

interface ClassBaseline {
  life: number;
  mana: number;
}

// PoE2 patch 0.4 starting life/mana per class. Provisional values; the
// real patch data can replace these in one place. Class names keyed
// against BuildInput.character_class.
const CLASS_BASELINE: Record<string, ClassBaseline> = {
  Warrior: { life: 50, mana: 30 },
  Sorceress: { life: 30, mana: 60 },
  Huntress: { life: 40, mana: 40 },
  Mercenary: { life: 45, mana: 35 },
  Monk: { life: 35, mana: 50 },
  Druid: { life: 45, mana: 35 },
  Witch: { life: 30, mana: 60 },
  Ranger: { life: 35, mana: 45 },
};

// Per-level grants. Calibration: Ranger lvl 98 / Life 1644 implies
// roughly 16/level * 98 + flat_from_mods (~50-100) ≈ 1644.
const PER_LEVEL_LIFE = 12;
const PER_LEVEL_MANA = 6;

export interface DefensePoolResult {
  life: number;
  mana: number;
  energy_shield: number;
  armour: number;
  evasion: number;
}

export function computeDefensePools(
  build: BuildInput,
  mods: ModEntry[],
): DefensePoolResult {
  const baseline = CLASS_BASELINE[build.character_class] ?? { life: 35, mana: 40 };

  const baseLife = baseline.life + (build.level - 1) * PER_LEVEL_LIFE;
  const baseMana = baseline.mana + (build.level - 1) * PER_LEVEL_MANA;
  // ES, armour, evasion all have base 0 — they come entirely from gear.
  const baseEs = 0;
  const baseArmour = 0;
  const baseEvasion = 0;

  return {
    life: scalePool(baseLife, "life", mods, build.assumptions),
    mana: scalePool(baseMana, "mana", mods, build.assumptions),
    energy_shield: scalePool(baseEs, "energy_shield", mods, build.assumptions),
    armour: scalePool(baseArmour, "armour", mods, build.assumptions),
    evasion: scalePool(baseEvasion, "evasion", mods, build.assumptions),
  };
}

function scalePool(
  base: number,
  target: ModTarget,
  mods: ModEntry[],
  assumptions: CalcAssumptions,
): number {
  let flat = 0;
  let increasedSum = 0;
  let moreFactor = 1;

  for (const m of mods) {
    if (m.target !== target) continue;
    if (m.scope === "minion" || m.scope === "ailment" || m.scope === "dot") continue;
    if (!isModActive(m, assumptions)) continue;

    if (m.operator === "FLAT") flat += m.value;
    else if (m.operator === "INCREASED") increasedSum += m.value;
    else if (m.operator === "REDUCED") increasedSum -= m.value;
    else if (m.operator === "MORE") moreFactor *= 1 + m.value / 100;
    else if (m.operator === "LESS") moreFactor *= 1 - m.value / 100;
  }

  return Math.round((base + flat) * (1 + increasedSum / 100) * moreFactor);
}
