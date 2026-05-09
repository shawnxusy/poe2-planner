// PoC: drive the PoB headless calc engine through pob-bridge.
//
// Loads our two fixtures, asks PoB for the canonical mainOutput stats,
// and prints them alongside the PoB-embedded reference values.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { PobBridge } from "../src/pob-bridge/index.js";

const FIXTURES = [
  {
    name: "ice-strike-1",
    path: "test-fixtures/ice-strike-1.txt",
    embedded: {
      CombinedDPS: 449538,
      AverageDamage: 145162,
      Speed: 3.0968,
      CritChance: 75.451,
      CritMultiplier: 5.29,
      Life: null, // Chaos Inoculation
      EnergyShield: null, // not in embedded list
      TotalEHP: 38702,
      Str: 41,
      Dex: 106,
      Int: 153,
    },
  },
  {
    name: "poison-build-1",
    path: "test-fixtures/poison-build-1.txt",
    embedded: {
      CombinedDPS: 407785,
      Life: 1644,
      EnergyShield: 3194,
      Mana: 699,
      Evasion: 27167,
      Armour: 0,
      FireResist: 74,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: 37,
      TotalEHP: 38637,
    },
  },
];

const STATS = [
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
  "Str",
  "Dex",
  "Int",
];

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "(nil)";
  if (typeof v === "number") return v.toFixed(2);
  return String(v);
}

function drift(actual: unknown, target: unknown): string {
  if (typeof actual !== "number" || typeof target !== "number") return "";
  if (target === 0) return "";
  const d = ((actual - target) / target) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

async function main() {
  console.log("Spawning PoB headless bridge...");
  const bridge = new PobBridge();
  const t0 = Date.now();
  await bridge.start();
  console.log(`  ready in ${Date.now() - t0}ms\n`);

  for (const fx of FIXTURES) {
    const code = readFileSync(fx.path, "utf-8").trim();
    const xml = decodePobCode(code);

    console.log(`=== ${fx.name} ===`);
    const t1 = Date.now();
    const result = await bridge.calc({ xml, name: fx.name, stats: STATS });
    console.log(`  calc latency: ${Date.now() - t1}ms`);

    for (const key of STATS) {
      const got = result[key];
      const target = (fx.embedded as Record<string, unknown>)[key];
      const driftStr = drift(got, target);
      console.log(
        `    ${key.padEnd(20)} ${fmt(got).padStart(15)}  (target: ${fmt(target).padStart(10)}  ${driftStr})`,
      );
    }
    console.log();
  }

  await bridge.stop();
  console.log("Bridge stopped.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
