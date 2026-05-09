// Top-level calculate(): canonical engine entrypoint.
//
// Two backends:
//   - "pob"  (default): pipe the build through PoB-PoE2's headless calc
//     via pob-bridge. Authoritative — the same numbers the PoB GUI shows.
//   - "experimental": our hand-rolled damage/defense pipeline. Kept in
//     the tree as a learning artifact + a fast offline scorer for AI
//     build mutation. Output is APPROXIMATE — see
//     memory/project_engine_calibration.md for the back-solved knobs.
//
// Why two backends:
//   - PoB (subprocess) is authoritative but ~400ms per calc. Fine for
//     "user clicks build → show stats" but slow when an AI is iterating
//     thousands of small mutations to score.
//   - The experimental engine runs in-process at <1ms but with ≤15%
//     drift on the fixtures it was calibrated against, and unknown drift
//     elsewhere. Useful for fast plausibility scoring; final stats
//     should always be re-validated through the PoB backend.

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
import { encodePobCode } from "./pob/codec.js";
import { PobBridge } from "./pob-bridge/index.js";

export interface CalculateOptions {
  game: GameData;
  // Backend selector. Defaults to "pob" (authoritative via headless).
  backend?: "pob" | "experimental";
  // For backend="pob": share an existing bridge to avoid spawn cost.
  bridge?: PobBridge;
  // For backend="pob": the original PoB XML if you have it. Skips a
  // re-encode round-trip when the build originated from a PoB share code.
  pobXml?: string;
}

// PoB headline stats we surface up front. The full mainOutput dict is
// available via calculateRaw() if a caller needs more.
const HEADLINE_STATS = [
  "CombinedDPS",
  "TotalDPS",
  "AverageDamage",
  "Speed",
  "CritChance",
  "CritMultiplier",
  "Life",
  "EnergyShield",
  "Mana",
  "Armour",
  "Evasion",
  "FireResist",
  "ColdResist",
  "LightningResist",
  "ChaosResist",
  "TotalEHP",
];

export async function calculate(
  build: BuildInput,
  opts: CalculateOptions,
): Promise<CalcResult> {
  const backend = opts.backend ?? "pob";
  if (backend === "pob") {
    return calculateViaPoB(build, opts);
  }
  return calculateExperimental(build, opts);
}

// ---- PoB headless backend (authoritative) -------------------------------

async function calculateViaPoB(
  build: BuildInput,
  opts: CalculateOptions,
): Promise<CalcResult> {
  const xml = opts.pobXml ?? buildToPobXml(build);
  if (!xml) {
    throw new Error(
      "calculate: PoB backend requires a PoB XML (pass opts.pobXml or use a build that originated from a share code)",
    );
  }
  const bridge = opts.bridge ?? new PobBridge();
  const ownsBridge = !opts.bridge;
  try {
    if (ownsBridge) await bridge.start();
    const stats = await bridge.calc({ xml, stats: HEADLINE_STATS });
    return pobStatsToCalcResult(build, stats);
  } finally {
    if (ownsBridge) await bridge.stop();
  }
}

function buildToPobXml(build: BuildInput): string | null {
  // For Phase 5 we'll add a proper BuildInput → PoB XML serializer to
  // support AI-generated builds without share codes. For now, the PoB
  // backend requires an `opts.pobXml` (e.g. obtained from the original
  // share code via decodePobCode + xmlToBuildInput). Returning null tells
  // calculate() to surface a clear error.
  void build;
  return null;
}

function pobStatsToCalcResult(
  build: BuildInput,
  stats: Record<string, number | string | boolean | null>,
): CalcResult {
  const num = (k: string): number => {
    const v = stats[k];
    return typeof v === "number" ? v : 0;
  };

  const breakdown: DamageBreakdown[] = [
    {
      damage_type: "physical" as DamageType,
      source: "pob_main_hit_combined",
      per_hit: num("AverageDamage"),
      per_second: num("CombinedDPS"),
    },
  ];

  const confidence: ConfidenceAssessment = {
    tier: "high",
    reason: "PoB-PoE2 headless calc",
  };

  return {
    damage: {
      boss_dps: num("CombinedDPS"),
      clear_dps: num("CombinedDPS"),
      breakdown,
      confidence,
      assumptions: build.assumptions,
    },
    defense: {
      ehp: Math.round(num("TotalEHP")),
      life: Math.round(num("Life")),
      es: Math.round(num("EnergyShield")),
      armour: Math.round(num("Armour")),
      armour_dr_pct: 0, // PoB doesn't expose this as a single number
      evasion: Math.round(num("Evasion")),
      evasion_chance_pct: 0, // ditto
      resistances: {
        fire: num("FireResist"),
        cold: num("ColdResist"),
        lightning: num("LightningResist"),
        chaos: num("ChaosResist"),
        fire_max: 75,
        cold_max: 75,
        lightning_max: 75,
        chaos_max: 75,
      },
      confidence,
    },
  };
}

// ---- Experimental backend (fast, approximate) ---------------------------

function calculateExperimental(build: BuildInput, opts: CalculateOptions): CalcResult {
  const game = opts.game;
  const r = resolve(build, game);
  const hit = computeHit({ build, game, mods: r.mods });
  const defense = computeDefense(build, r.mods);

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
  // The experimental backend is APPROXIMATE — even at 100% mod resolution
  // it carries unknown drift from back-solved Hollow Palm scaling, evasion
  // formula, EHP rollup choice, etc. Cap confidence at "medium" so callers
  // know to re-validate through the PoB backend for final numbers.
  if (pct >= 0.85) {
    return {
      tier: "medium",
      reason: `experimental backend, ${(pct * 100).toFixed(0)}% mod resolution; revalidate via PoB for authoritative numbers`,
    };
  }
  return {
    tier: "low",
    reason: `experimental backend, ${(pct * 100).toFixed(0)}% mod resolution; many mods unrecognised`,
  };
}
