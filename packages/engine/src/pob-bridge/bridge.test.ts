// Integration test for the PoB headless bridge.
//
// Boots a luajit subprocess, loads each fixture's XML, and asserts that
// PoB's authoritative output for known-stable stats (CritChance,
// CritMultiplier, max-hit-taken-by-element, attribute totals) matches
// the values PoB itself embedded in those fixtures.
//
// We deliberately don't assert DPS / Evasion / TotalEHP — those depend
// on flask/condition state which the embedded snapshot captured at save
// time and headless recalcs from a fresh config; both are authoritative
// under their own configurations.
//
// Note: this test requires `luajit` on PATH and the PathOfBuilding-PoE2
// repo at /tmp/pob-poe2 (set BridgeOptions.pobRoot to override).
// It is skipped automatically when those aren't available.

import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodePobCode } from "../pob/codec.js";
import { PobBridge } from "./index.js";

const fixturesDir = resolvePath(__dirname, "../../test-fixtures");
const POB_ROOT = "/tmp/pob-poe2";

function isLuajitAvailable(): boolean {
  try {
    execSync("luajit -v", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const skip = !isLuajitAvailable() || !existsSync(`${POB_ROOT}/src/HeadlessWrapper.lua`);

describe.skipIf(skip)("PobBridge", () => {
  let bridge: PobBridge;

  beforeAll(async () => {
    bridge = new PobBridge({ pobRoot: POB_ROOT });
    await bridge.start();
  }, 30000);

  afterAll(async () => {
    if (bridge) await bridge.stop();
  });

  it("ping returns pong", async () => {
    const r = await bridge.ping();
    expect(r).toBe("pong");
  });

  it("ice-strike-1: PoB authoritative crit + hit-pool stats match embedded", async () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();
    const xml = decodePobCode(code);
    const stats = await bridge.calc({
      xml,
      stats: [
        "CritChance",
        "CritMultiplier",
        "PhysicalMaximumHitTaken",
        "ColdMaximumHitTaken",
        "FireMaximumHitTaken",
        "LightningMaximumHitTaken",
      ],
    });

    expect(stats.CritChance).toBeCloseTo(75.45, 1);
    expect(stats.CritMultiplier).toBeCloseTo(5.29, 2);
    expect(stats.PhysicalMaximumHitTaken).toBe(8646);
    expect(stats.ColdMaximumHitTaken).toBe(30879);
    expect(stats.FireMaximumHitTaken).toBe(30879);
    expect(stats.LightningMaximumHitTaken).toBe(30879);
  }, 30000);

  it("poison-build-1: PoB authoritative pool/resist stats match embedded", async () => {
    const code = readFileSync(`${fixturesDir}/poison-build-1.txt`, "utf-8").trim();
    const xml = decodePobCode(code);
    const stats = await bridge.calc({
      xml,
      stats: ["Life", "Mana", "ColdResist", "LightningResist", "ChaosResist"],
    });

    expect(stats.Life).toBe(1644);
    expect(stats.Mana).toBe(699);
    expect(stats.ColdResist).toBe(75);
    expect(stats.LightningResist).toBe(75);
    expect(stats.ChaosResist).toBe(37);
  }, 30000);

  it("subsequent calls reuse the same subprocess (latency check)", async () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();
    const xml = decodePobCode(code);
    const t0 = Date.now();
    await bridge.calc({ xml, stats: ["CritChance"] });
    const reusedLatency = Date.now() - t0;
    // After the first calc, subsequent ones should be substantially under
    // a second since the subprocess is hot. Generous bound for CI variance.
    expect(reusedLatency).toBeLessThan(2000);
  }, 30000);
});
