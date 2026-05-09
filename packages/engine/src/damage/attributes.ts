// Attribute totals (Strength / Dexterity / Intelligence) for the build.
//
// Each character class starts with a class-specific attribute set, then
// gains 2/2/2 from leveling and FLAT entries from passives + items. We
// don't yet model "+X% to all attributes" multipliers — they're rare on
// hit fixtures and we can layer them once the FLAT pool is correct.
//
// Used by:
//   - Hollow Palm Technique (scales unarmed damage by Dex+Int)
//   - Strength → 0.5% increased phys damage per str (PoE convention)
//   - Dexterity → +1 accuracy per dex (PoE convention)
//   - Intelligence → +X mana per int

import type { BuildInput } from "@poe2/types";
import type { ModEntry, ModTarget } from "../modifiers/types.js";

export interface AttributeTotals {
  strength: number;
  dexterity: number;
  intelligence: number;
}

// Class baselines (Path of Exile 2 patch 0.4 — RePoE-Fork values for the
// six base classes). Ascendancies don't change starting attributes.
const CLASS_BASE: Record<string, AttributeTotals> = {
  Warrior: { strength: 28, dexterity: 8, intelligence: 8 },
  Sorceress: { strength: 8, dexterity: 8, intelligence: 28 },
  Huntress: { strength: 13, dexterity: 18, intelligence: 13 },
  Mercenary: { strength: 18, dexterity: 13, intelligence: 13 },
  Monk: { strength: 8, dexterity: 18, intelligence: 18 },
  Druid: { strength: 18, dexterity: 13, intelligence: 13 },
  Witch: { strength: 8, dexterity: 8, intelligence: 28 },
  Ranger: { strength: 13, dexterity: 28, intelligence: 8 },
};

// Per-level attribute gain in PoE2 — patch 0.4 grants nothing automatic
// per level. All non-base attribute totals come from gear/passives/flasks
// (validated against ice-strike-1.txt: Monk base 8/18/18 + flat additions
// from passives/gear yields the embedded 41/106/153).
const PER_LEVEL_ATTR = 0;

export function computeAttributes(
  build: BuildInput,
  mods: ModEntry[],
): AttributeTotals {
  const base = CLASS_BASE[build.character_class] ?? {
    strength: 8,
    dexterity: 8,
    intelligence: 8,
  };

  // Levels add a flat bonus to every attribute (well, +2 per level in PoE2 ≈).
  const levelBonus = (build.level - 1) * PER_LEVEL_ATTR;

  // Sum FLAT entries for each attribute, plus all_attributes.
  const flatStr = sumFlat(mods, "strength") + sumFlat(mods, "all_attributes");
  const flatDex = sumFlat(mods, "dexterity") + sumFlat(mods, "all_attributes");
  const flatInt = sumFlat(mods, "intelligence") + sumFlat(mods, "all_attributes");

  const strength = base.strength + levelBonus + flatStr;
  const dexterity = base.dexterity + levelBonus + flatDex;
  const intelligence = base.intelligence + levelBonus + flatInt;

  return {
    strength: Math.round(strength),
    dexterity: Math.round(dexterity),
    intelligence: Math.round(intelligence),
  };
}

function sumFlat(mods: ModEntry[], target: ModTarget): number {
  // Attributes pull from any scope — passives are "global", gear flats are
  // "defense"-ish in our categorisation. Easiest is to scan every entry.
  return mods
    .filter((m) => m.target === target && m.operator === "FLAT")
    .reduce((acc, m) => acc + m.value, 0);
}
