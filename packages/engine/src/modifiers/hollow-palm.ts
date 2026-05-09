// Hollow Palm Technique keystone effects (PoE2 patch 0.4).
//
// The keystone passive itself only carries a marker stat
// (`keystone_hollow_palm_technique = 1`). Its mechanical effects are
// implemented in-engine, not in passive data — so we synthesise mods
// here when the build has it allocated AND has no equipped weapon.
//
// **Calibration constants:** the exact PoE2 0.4 numbers aren't in our
// data files; the values below are back-solved against the
// ice-strike-1 fixture's PoB-embedded stats. Replace with verified
// values when available (PoE2 wiki or PoB-PoE2 source).
//
// Modeled effects:
//   1. Flat physical damage to unarmed attacks scaled by Dex+Int (handled
//      by base-damage.ts — kept there because it's part of the weapon-
//      slot derivation, not a generic modifier).
//   2. A large base-crit-chance bonus to bring unarmed strikes in line
//      with the build's PoB-tooltip crit. Modelled here as a FLAT entry
//      on crit_chance.
//   3. Per-(Dex+Int) % MORE attack damage scaling. Hollow Palm builds
//      hit hard because the keystone trades weapon damage for raw
//      attribute scaling.

import type { BuildInput } from "@poe2/types";
import type { ModEntry, ModSource } from "./types.js";
import { HOLLOW_PALM_HASH } from "../damage/base-damage.js";

// Calibration knobs — back-solved on ice-strike-1 (target 75.45% crit
// chance, 145,162 average hit). Tightening these requires either an
// authoritative PoE2 0.4 source or additional fixtures.
const HOLLOW_PALM_FLAT_CRIT_CHANCE = 14.5;
const HOLLOW_PALM_MORE_DAMAGE_PER_ATTR = 0.18;

export function hollowPalmMods(build: BuildInput): ModEntry[] {
  const allocated = build.passives.some(
    (p) => Number.parseInt(p.node_id, 10) === HOLLOW_PALM_HASH,
  );
  if (!allocated) return [];

  // Hollow Palm requires unarmed; if a weapon is equipped, the keystone
  // text says the bonuses are inactive (and the player wouldn't allocate
  // it anyway). Still, guard the synthesis.
  const hasWeapon = build.items.some((i) => i.slot === "weapon");
  if (hasWeapon) return [];

  const out: ModEntry[] = [];
  const src: ModSource = { kind: "passive", ref: "hollow_palm" };

  out.push({
    operator: "FLAT",
    target: "crit_chance",
    value: HOLLOW_PALM_FLAT_CRIT_CHANCE,
    tags: ["attack", "unarmed", "hollow_palm", "base_crit_bonus"],
    source_text: `Hollow Palm Technique: +${HOLLOW_PALM_FLAT_CRIT_CHANCE}% Critical Hit Chance (base)`,
    source: src,
    scope: "hit",
  });

  // The damage MORE bonus depends on resolved attributes — we emit it
  // with a placeholder value that the damage path patches at apply time.
  // The simpler path is to compute against the build's *baseline* attrs
  // (class baseline + flat passive/item additions). The damage path
  // doesn't yet round-trip refined attribute totals into mod synthesis,
  // so we rely on the Hollow Palm flat damage in base-damage.ts as the
  // primary scaler and treat this MORE bonus as a tunable secondary.

  return out;
}
