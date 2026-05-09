// Per-element flat damage pool.
//
// Sums every FLAT and FLAT_RANGE entry on a damage target into a (min, max)
// per element. FLAT entries (no range) contribute the same value to both
// min and max — that's the convention PoE uses for "+5 fire damage" type
// mods that aren't a range.

import type { CalcAssumptions, DamageType } from "@poe2/types";
import { isModActive } from "../modifiers/conditions.js";
import type { ModEntry, ModTarget } from "../modifiers/types.js";
import type { DamageRange, PerElement } from "./types.js";
import { emptyPerElement, emptyRange } from "./types.js";

const TARGET_TO_ELEMENT: Partial<Record<ModTarget, DamageType>> = {
  physical_damage: "physical",
  fire_damage: "fire",
  cold_damage: "cold",
  lightning_damage: "lightning",
  chaos_damage: "chaos",
};

export function flatDamageByElement(
  mods: ModEntry[],
  assumptions: CalcAssumptions,
): PerElement<DamageRange> {
  const out = emptyPerElement<DamageRange>(emptyRange);

  for (const m of mods) {
    if (m.scope === "minion" || m.scope === "ailment" || m.scope === "dot") continue;
    if (!isModActive(m, assumptions)) continue;
    if (m.tags.includes("conversion")) continue; // conversion handled separately

    const elem = TARGET_TO_ELEMENT[m.target];
    if (!elem) continue;

    if (m.operator === "FLAT_RANGE") {
      out[elem].min += m.value;
      out[elem].max += m.value_high ?? m.value;
    } else if (m.operator === "FLAT") {
      // Bare FLATs are the same value for min/max (no range).
      out[elem].min += m.value;
      out[elem].max += m.value;
    }
  }

  return out;
}
