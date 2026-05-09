import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePobCode } from "./codec.js";
import { parsePobXml } from "./xml.js";
import {
  derivedStats,
  extractBuildHeader,
  extractPlayerStats,
} from "./player-stats.js";

const fixturePath = resolve(__dirname, "../../test-fixtures/poison-build-1.txt");

describe("PoB player stats — poison-build-1 (Ranger / Pathfinder, lvl 98)", () => {
  const code = readFileSync(fixturePath, "utf-8").trim();
  const xml = decodePobCode(code);
  const root = parsePobXml(xml);
  const stats = extractPlayerStats(root);
  const derived = derivedStats(stats);
  const header = extractBuildHeader(root);

  it("recognises class + ascendancy from the build header", () => {
    expect(header.className).toBe("Ranger");
    expect(header.ascendancy).toBe("Pathfinder");
    expect(header.level).toBe(98);
  });

  it("surfaces the headline DPS and EHP from PoB's embedded stats", () => {
    // Round to integers since PoB stores fractional values.
    expect(Math.round(derived.combined_dps!)).toBe(407785);
    expect(Math.round(derived.total_ehp!)).toBe(38638);
  });

  it("captures the DoT contribution split (poison-heavy)", () => {
    expect(Math.round(derived.poison_dps!)).toBe(398615);
    expect(Math.round(derived.bleed_dps!)).toBe(33095);
  });

  it("captures defense components (life + ES + evasion)", () => {
    expect(derived.life).toBe(1644);
    expect(derived.es).toBe(3194);
    expect(derived.evasion).toBe(27167);
    expect(derived.armour).toBe(0);
    expect(derived.fire_res).toBe(74);
    expect(derived.cold_res).toBe(75);
    expect(derived.lightning_res).toBe(75);
    expect(derived.chaos_res).toBe(37);
  });
});
