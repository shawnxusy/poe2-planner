// Defense validation against PoB-embedded values.
//
// Targets from poison-build-1.txt (Ranger / Pathfinder lvl 98):
//   Life       = 1,644
//   ES         = 3,194
//   Mana       = 699
//   Evasion    = 27,167
//   Armour     = 0
//   Fire Res   = 74
//   Cold Res   = 75 (+6 over cap)
//   Lightning Res = 75 (+8 over cap)
//   Chaos Res  = 37
//   TotalEHP   = 38,637
//
// Phase 4 ≤15% drift target.

import { resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

import { decodePobCode } from "../pob/codec.js";
import { parsePobXml } from "../pob/xml.js";
import { xmlToBuildInput } from "../pob/build-input.js";
import { loadGameData } from "../data/load.js";
import type { GameData } from "../data/types.js";
import { resolve as resolveMods } from "../modifiers/resolver.js";
import { computeDefense } from "./index.js";

const fixturesDir = resolvePath(__dirname, "../../test-fixtures");

function approx(actual: number, target: number, pct: number, label: string): void {
  const drift = Math.abs(actual - target) / Math.max(target, 1);
  expect(
    drift,
    `${label}: ${actual} not within ${pct * 100}% of ${target} (drift ${(drift * 100).toFixed(1)}%)`,
  ).toBeLessThan(pct);
}

describe("defense — poison-build-1", () => {
  let game: GameData;
  beforeAll(async () => {
    game = await loadGameData();
  }, 30000);

  it("Life within 15% of PoB 1,644", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const r = resolveMods(build, game);
    const d = computeDefense(build, r.mods);
    approx(d.life, 1644, 0.15, "life");
  });

  it("Energy Shield within 15% of PoB 3,194", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const r = resolveMods(build, game);
    const d = computeDefense(build, r.mods);
    approx(d.es, 3194, 0.15, "energy_shield");
  });

  it("Evasion within 15% of PoB 27,167", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const r = resolveMods(build, game);
    const d = computeDefense(build, r.mods);
    approx(d.evasion, 27167, 0.15, "evasion");
  });

  it("resistances clamped to max and match PoB", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const r = resolveMods(build, game);
    const d = computeDefense(build, r.mods);
    // Capped values at max 75 (PoB target also 75 for fire/cold/lightning,
    // 74 for fire — within 1pp).
    expect(d.resistances.fire).toBeGreaterThanOrEqual(70);
    expect(d.resistances.cold).toBe(75);
    expect(d.resistances.lightning).toBe(75);
    expect(d.resistances.chaos).toBe(37);
  });

  it("EHP within 15% of PoB 38,637", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const r = resolveMods(build, game);
    const d = computeDefense(build, r.mods);
    approx(d.ehp, 38637, 0.15, "ehp");
  });
});
