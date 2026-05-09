// Rage stack damage scaling (PoE2 patch 0.4 default).
//
// Rage in PoE2 grants 1% more attack damage per stack (canonical PoB
// constant). The build's PoB Config exposes the active Rage count via
// the `multiplierRage` input, which we capture in `assumptions.rage`.

import type { CalcAssumptions } from "@poe2/types";
import type { ModEntry, ModSource } from "./types.js";

const MORE_DAMAGE_PER_RAGE = 1;

export function rageMods(assumptions: CalcAssumptions): ModEntry[] {
  if (!assumptions.rage || assumptions.rage <= 0) return [];
  const src: ModSource = { kind: "config", ref: `rage=${assumptions.rage}` };
  return [
    {
      operator: "MORE",
      target: "attack_damage",
      value: MORE_DAMAGE_PER_RAGE * assumptions.rage,
      tags: ["attack", "rage"],
      source_text: `Rage damage (${assumptions.rage} stacks)`,
      source: src,
      scope: "hit",
    },
  ];
}
