// Attack speed for the main skill.
//
// Formula:
//   attacks_per_second
//     = base_attack_rate
//       × (1 + sum_increased_attack_speed / 100)
//       × Π (1 + more_factor / 100)
//
// `base_attack_rate` comes from the weapon (or unarmed) and is intentionally
// passed in by the caller — different builds source it differently
// (weapon.attack_rate, unarmed_default, two-handed bow attack rate, etc.).

import type { CalcAssumptions } from "@poe2/types";
import { isModActive } from "../modifiers/conditions.js";
import type { ModEntry } from "../modifiers/types.js";

// PoE2 unarmed baseline. This is a tunable constant — if drift shows up
// here we'll move it to a per-class table.
export const UNARMED_BASE_ATTACK_RATE = 1.20;

export function computeAttackSpeed(
  baseAttackRate: number,
  mods: ModEntry[],
  assumptions: CalcAssumptions,
): number {
  let increasedSum = 0;
  let moreFactor = 1;

  for (const m of mods) {
    if (m.target !== "attack_speed" && m.target !== "skill_speed") continue;
    if (m.scope === "minion" || m.scope === "ailment") continue;
    if (!isModActive(m, assumptions)) continue;
    if (m.operator === "INCREASED") increasedSum += m.value;
    else if (m.operator === "REDUCED") increasedSum -= m.value;
    else if (m.operator === "MORE") moreFactor *= 1 + m.value / 100;
    else if (m.operator === "LESS") moreFactor *= 1 - m.value / 100;
  }

  return baseAttackRate * (1 + increasedSum / 100) * moreFactor;
}
