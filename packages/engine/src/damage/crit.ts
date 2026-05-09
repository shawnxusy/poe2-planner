// Crit chance and multiplier rollup for hit damage.
//
// PoE2 conventions used here:
//   - Base crit chance from the weapon (default 5% if not provided).
//   - Increased pool sums "X% increased crit chance".
//   - FLAT entries on crit_chance add directly to the chance (rare).
//   - crit_damage in our model is the BONUS over 100% (i.e. +X% means a
//     crit deals (1 + X/100)× normal damage; PoB calls the result the
//     "crit multiplier"). Heritage value 100 means double damage.
//
// Cap rules: crit chance is hard-capped at 100%; crit multiplier is
// soft-capped (you can stack arbitrarily high).

import type { ModEntry } from "../modifiers/types.js";

// Default base crit if none is found on the weapon. PoE2 uses 5% as the
// floor for most weapons.
export const DEFAULT_BASE_CRIT = 5;

export function computeCritChance(
  baseCritPct: number,
  mods: ModEntry[],
): number {
  let increasedSum = 0;
  let flat = 0;
  let moreFactor = 1;

  for (const m of mods) {
    if (m.target !== "crit_chance") continue;
    if (m.scope === "minion" || m.scope === "ailment") continue;
    if (m.operator === "INCREASED") increasedSum += m.value;
    else if (m.operator === "REDUCED") increasedSum -= m.value;
    else if (m.operator === "FLAT") flat += m.value;
    else if (m.operator === "MORE") moreFactor *= 1 + m.value / 100;
    else if (m.operator === "LESS") moreFactor *= 1 - m.value / 100;
  }

  const raw = (baseCritPct * (1 + increasedSum / 100) + flat) * moreFactor;
  return Math.min(raw, 100);
}

// Returns the multiplier as a factor (1.5, 5.29, etc.). PoB convention:
// 100 = 2.0× damage on crit; the bonus pool starts at +100% by default.
export function computeCritMultiplier(mods: ModEntry[]): number {
  // Base bonus over normal damage. PoE2 default is 100% (i.e. crits do 2×).
  let bonus = 100;
  for (const m of mods) {
    if (m.target !== "crit_damage") continue;
    if (m.scope === "minion" || m.scope === "ailment") continue;
    // Both INCREASED and FLAT entries on crit_damage are additive in PoB
    // (PoE doesn't use a separate "increased crit multiplier" pool).
    if (m.operator === "INCREASED" || m.operator === "FLAT") bonus += m.value;
    else if (m.operator === "REDUCED") bonus -= m.value;
  }
  return 1 + bonus / 100;
}
