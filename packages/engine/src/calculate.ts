// Top-level calculate(): the canonical engine entrypoint.
//
// Combines:
//   1. Modifier resolver — passives, items, supports, charges, rage,
//      Hollow Palm, quest rewards, skill stat_sets.
//   2. Hit damage path — base + flat + conversion + increased + more →
//      average hit, attack speed, crit chance/multi → DPS.
//   3. Defense path — pools (life/ES/armour/evasion), resistances, EHP.
//
// Returns a CalcResult with damage + defense sub-objects, mirroring
// @poe2/types for downstream API/UI consumption.

import type {
  BuildInput,
  CalcResult,
  ConfidenceAssessment,
  DamageBreakdown,
  DamageType,
} from "@poe2/types";
import type { GameData } from "./data/types.js";
import { computeDefense } from "./defense/index.js";
import { computeHit } from "./damage/hit.js";
import { resolve } from "./modifiers/resolver.js";

export interface CalculateOptions {
  game: GameData;
}

export function calculate(build: BuildInput, opts: CalculateOptions): CalcResult {
  const game = opts.game;
  const r = resolve(build, game);
  const hit = computeHit({ build, game, mods: r.mods });
  const defense = computeDefense(build, r.mods);

  // Damage breakdown by element — main hit only. DoT paths land later.
  const breakdown: DamageBreakdown[] = [];
  for (const e of ["physical", "fire", "cold", "lightning", "chaos"] as DamageType[]) {
    const range = hit.per_element[e];
    const avg = (range.min + range.max) / 2;
    if (avg <= 0.5) continue;
    breakdown.push({
      damage_type: e,
      source: "main_hit",
      per_hit: avg,
      per_second: avg * hit.attack_speed * hit.hit_chance,
    });
  }

  const damageConfidence = damageConfidenceFromCoverage(r);

  return {
    damage: {
      boss_dps: hit.combined_dps,
      // PoE2 doesn't have a separate "clear DPS" tooltip; for the engine
      // we mirror combined_dps for now and refine when we model AoE
      // multipliers / target counts.
      clear_dps: hit.combined_dps,
      breakdown,
      confidence: damageConfidence,
      assumptions: build.assumptions,
    },
    defense,
  };
}

function damageConfidenceFromCoverage(r: ReturnType<typeof resolve>): ConfidenceAssessment {
  const total = r.mods.entries.length;
  const unknown = r.mods.entries.filter((e) => e.operator === "UNKNOWN").length;
  const pct = total === 0 ? 0 : 1 - unknown / total;
  if (pct >= 0.9) {
    return {
      tier: "high",
      reason: `${(pct * 100).toFixed(0)}% mod resolution; calibrated against fixture targets`,
    };
  }
  if (pct >= 0.75) {
    return {
      tier: "medium",
      reason: `${(pct * 100).toFixed(0)}% mod resolution; some unmatched mods may drift the result`,
    };
  }
  return {
    tier: "low",
    reason: `${(pct * 100).toFixed(0)}% mod resolution; many mods unrecognised — result is a rough estimate`,
  };
}
