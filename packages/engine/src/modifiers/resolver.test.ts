// Integration test for the modifier resolver.
//
// The goal is not to assert exact mod counts (those drift with each patch)
// but to confirm:
//   - Every passive hash from the fixture resolves (we've already proven
//     this in data/load.test.ts; here we make sure the resolver agrees).
//   - The resolver finds at least one entry of each major target group
//     present in the build (life/ES, crit, attack speed, cold damage…).
//   - The unknown rate is bounded — if it grows unboundedly we'll see it
//     here before it drifts the calc paths.
//
// We test against TWO fixtures: poison-build-1 (DoT Ranger) and
// ice-strike-1 (Hit Monk) so the mapping table gets exercised across
// hit AND DoT archetypes.

import { resolve as resolvePath } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

import { decodePobCode } from "../pob/codec.js";
import { parsePobXml } from "../pob/xml.js";
import { xmlToBuildInput } from "../pob/build-input.js";
import { loadGameData } from "../data/load.js";
import type { GameData } from "../data/types.js";
import { coverageReport, resolve } from "./resolver.js";

const fixturesDir = resolvePath(__dirname, "../../test-fixtures");

describe("resolve() — modifier resolver", () => {
  let game: GameData;
  beforeAll(async () => {
    game = await loadGameData();
  }, 30000);

  it("resolves the ice-strike fixture with no missing passives", () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const result = resolve(build, game);
    const cov = coverageReport(result);

    expect(result.missing_passives).toEqual([]);
    // A fully-geared lvl 95 build resolves on the order of ~150–200 entries.
    // If this drops below 100 something fundamental broke.
    expect(cov.total).toBeGreaterThan(100);
    // Resolution rate floor — if it drops below 85% we're losing coverage.
    expect(cov.pct_resolved).toBeGreaterThan(0.85);

    // Spot-check that key targets we expect for an Ice Strike Monk all show up.
    const targets = new Set(result.mods.entries.map((e) => e.target));
    expect(targets.has("crit_chance")).toBe(true);
    expect(targets.has("crit_damage")).toBe(true);
    expect(targets.has("attack_speed")).toBe(true);
    expect(targets.has("energy_shield")).toBe(true);
    expect(targets.has("evasion")).toBe(true);
    expect(targets.has("cold_damage")).toBe(true);
  });

  it("resolves the poison-build-1 fixture with no missing passives", () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const result = resolve(build, game);
    const cov = coverageReport(result);

    expect(result.missing_passives).toEqual([]);
    expect(cov.total).toBeGreaterThan(100);
    expect(cov.pct_resolved).toBeGreaterThan(0.85);

    const targets = new Set(result.mods.entries.map((e) => e.target));
    expect(targets.has("life")).toBe(true);
    expect(targets.has("evasion")).toBe(true);
  });
});
