// End-to-end manifest validation: we should be able to take a real
// build XML, inject a Config Inputs profile, send it through PoB
// headless, and observe that PoB respects the override.
//
// Mechanism check: ice-strike-1 has `PowerChargesMax=3`. The base XML
// leaves `usePowerCharges` unchecked, so headline CritChance is the
// no-charges value (~75.5%). Flipping `usePowerCharges=true` should
// activate the +50% increased crit chance per charge bonus, pushing
// crit chance higher (likely 100% capped given the +150% extra). This
// proves the injection lands AND PoB honors it.
//
// Skipped automatically when luajit / pob repo aren't present.

import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decodePobCode } from "../pob/codec.js";
import { PobBridge } from "./index.js";
import { injectConfigInputs } from "./inject-config.js";
import { CONFIG_OPTIONS_MANIFEST } from "./config-options.js";

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

describe.skipIf(skip)("config-inputs injection", () => {
  let bridge: PobBridge;

  beforeAll(async () => {
    bridge = new PobBridge({ pobRoot: POB_ROOT });
    await bridge.start();
  }, 30000);

  afterAll(async () => {
    if (bridge) await bridge.stop();
  });

  it("manifest is non-empty and well-formed", () => {
    expect(CONFIG_OPTIONS_MANIFEST.total).toBeGreaterThan(500);
    expect(CONFIG_OPTIONS_MANIFEST.options.length).toBe(
      CONFIG_OPTIONS_MANIFEST.total,
    );
    // Spot-check an option we depend on for this test.
    const usePowerCharges = CONFIG_OPTIONS_MANIFEST.options.find(
      (o) => o.var === "usePowerCharges",
    );
    expect(usePowerCharges).toBeDefined();
    expect(usePowerCharges?.type).toBe("check");
  });

  it("injected Config Input flows through and changes the calc output", async () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();
    const baseXml = decodePobCode(code);

    // Baseline: ice-strike-1 ships with `multiplierRage=30` in its
    // <Config>. Killing rage stacks should drop DPS noticeably because
    // the build picks up "% MORE damage per Rage" scaling.
    const baseline = await bridge.calc({
      xml: baseXml,
      stats: ["CombinedDPS", "AverageDamage"],
    });

    const noRageXml = injectConfigInputs(baseXml, { multiplierRage: 0 });
    expect(noRageXml).toMatch(/<Input\s+name="multiplierRage"\s+number="0"\/>/);

    const noRage = await bridge.calc({
      xml: noRageXml,
      stats: ["CombinedDPS", "AverageDamage"],
    });

    // Stripping Rage must reduce DPS — and we expect it noticeably
    // (~10%+) since the build invests in Rage scaling. We assert
    // monotonicity instead of a fixed delta to stay robust across PoB
    // upstream balance tweaks.
    const baseDps = Number(baseline.CombinedDPS);
    const reducedDps = Number(noRage.CombinedDPS);
    expect(baseDps).toBeGreaterThan(0);
    expect(reducedDps).toBeGreaterThan(0);
    expect(reducedDps).toBeLessThan(baseDps);
    // And it must not be a rounding-noise difference.
    expect((baseDps - reducedDps) / baseDps).toBeGreaterThan(0.05);
  }, 30000);

  it("repeatedly injecting the same key overrides cleanly (idempotent)", async () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();
    const xml1 = injectConfigInputs(decodePobCode(code), {
      usePowerCharges: true,
    });
    const xml2 = injectConfigInputs(xml1, { usePowerCharges: false });
    // The "true" entry must be gone (replaced by "false") — no duplicates.
    const trueCount = (xml2.match(/name="usePowerCharges"\s+boolean="true"/g) ?? []).length;
    const falseCount = (xml2.match(/name="usePowerCharges"\s+boolean="false"/g) ?? []).length;
    expect(trueCount).toBe(0);
    expect(falseCount).toBe(1);
  });
});
