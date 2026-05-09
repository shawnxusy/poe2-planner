// Charge-effect modifiers (Power / Frenzy / Endurance).
//
// PoE2 charges grant per-charge bonuses while active. The build's
// assumptions object tracks how many of each charge type the user
// expects to have up; this resolver converts those counts into
// ModEntries that feed the same pools as passives/items.
//
// Default per-charge values for PoE2 patch 0.4:
//   Power     → +50% increased Critical Hit Chance per charge.
//   Frenzy    → +4% MORE Damage and +4% MORE Attack/Cast/Skill Speed per charge.
//   Endurance → +4% to All Elemental Resistances and +4% Physical Damage Reduction per charge.
//
// These are PoB-PoE2 defaults; future patches may re-balance — when they
// do, this is the single place to adjust.

import type { CalcAssumptions } from "@poe2/types";
import type { ModEntry, ModSource } from "./types.js";

const POWER_CRIT_CHANCE_PER_CHARGE = 50;
const FRENZY_DAMAGE_PER_CHARGE = 4;
const FRENZY_SPEED_PER_CHARGE = 4;
const ENDURANCE_RESIST_PER_CHARGE = 4;

export function chargeMods(assumptions: CalcAssumptions): ModEntry[] {
  const out: ModEntry[] = [];

  if (assumptions.power_charges > 0) {
    const src: ModSource = { kind: "config", ref: `power_charges=${assumptions.power_charges}` };
    out.push({
      operator: "INCREASED",
      target: "crit_chance",
      value: POWER_CRIT_CHANCE_PER_CHARGE * assumptions.power_charges,
      tags: ["charge", "power_charge"],
      source_text: `Power Charges (${assumptions.power_charges})`,
      source: src,
      scope: "hit",
    });
  }

  if (assumptions.frenzy_charges > 0) {
    const src: ModSource = {
      kind: "config",
      ref: `frenzy_charges=${assumptions.frenzy_charges}`,
    };
    out.push({
      operator: "MORE",
      target: "any_damage",
      value: FRENZY_DAMAGE_PER_CHARGE * assumptions.frenzy_charges,
      tags: ["charge", "frenzy_charge"],
      source_text: `Frenzy Charges damage (${assumptions.frenzy_charges})`,
      source: src,
      scope: "hit",
    });
    out.push({
      operator: "MORE",
      target: "attack_speed",
      value: FRENZY_SPEED_PER_CHARGE * assumptions.frenzy_charges,
      tags: ["charge", "frenzy_charge"],
      source_text: `Frenzy Charges speed (${assumptions.frenzy_charges})`,
      source: src,
      scope: "hit",
    });
  }

  if (assumptions.endurance_charges > 0) {
    const src: ModSource = {
      kind: "config",
      ref: `endurance_charges=${assumptions.endurance_charges}`,
    };
    out.push({
      operator: "FLAT",
      target: "all_elemental_resistance",
      value: ENDURANCE_RESIST_PER_CHARGE * assumptions.endurance_charges,
      tags: ["charge", "endurance_charge"],
      source_text: `Endurance Charges (${assumptions.endurance_charges})`,
      source: src,
      scope: "defense",
    });
  }

  return out;
}
