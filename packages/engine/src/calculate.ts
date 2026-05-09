// Top-level calculate(): pipes a build through PoB-PoE2's headless calc
// engine via pob-bridge and returns the canonical CalcResult. There is
// no in-process fallback — PoB is the single source of truth.
//
// For builds that originate from PoB share codes, pass the decoded XML
// directly via opts.pobXml. For AI-generated builds (no share code),
// we'll need a BuildInput → PoB XML serialiser; for now calculate()
// surfaces a clear error in that case so the caller can route it.

import type {
  BuildInput,
  CalcResult,
  ConfidenceAssessment,
  DamageBreakdown,
  DamageType,
} from "@poe2/types";
import { PobBridge } from "./pob-bridge/index.js";

export interface CalculateOptions {
  // Reuse an existing bridge to avoid spawn cost. If omitted, a fresh
  // bridge is started for this call and stopped on completion.
  bridge?: PobBridge;
  // The PoB XML representation of the build. Required until the
  // BuildInput → PoB XML serialiser lands; until then, callers
  // importing from PoB share codes should pass the decoded XML through.
  pobXml: string;
}

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
  if (!opts.pobXml) {
    throw new Error(
      "calculate: opts.pobXml is required. For PoB share codes, pass decodePobCode(code). " +
        "For AI-generated builds without a share code, the BuildInput → PoB XML serialiser is not yet implemented.",
    );
  }

  const bridge = opts.bridge ?? new PobBridge();
  const ownsBridge = !opts.bridge;
  try {
    if (ownsBridge) await bridge.start();
    const stats = await bridge.calc({ xml: opts.pobXml, stats: HEADLINE_STATS });
    return statsToCalcResult(build, stats);
  } finally {
    if (ownsBridge) await bridge.stop();
  }
}

function statsToCalcResult(
  build: BuildInput,
  stats: Record<string, number | string | boolean | null>,
): CalcResult {
  const num = (k: string): number => {
    const v = stats[k];
    return typeof v === "number" ? v : 0;
  };

  // PoB's authoritative output is a flat dict; we surface the headline
  // breakdown as a single combined-hit row. Per-element decomposition
  // would require either parsing PoB's breakdown text or pulling
  // per-element output keys from the calc — both are easy follow-ups.
  const breakdown: DamageBreakdown[] = [
    {
      damage_type: "physical" as DamageType,
      source: "main_hit_combined",
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
      armour_dr_pct: 0,
      evasion: Math.round(num("Evasion")),
      evasion_chance_pct: 0,
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
