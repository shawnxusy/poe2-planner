import { describe, expect, it } from "vitest";
import { parseModText } from "./parser.js";

const src = (kind: "passive" | "implicit" | "explicit" = "explicit", ref = "test") =>
  ({ kind, ref }) as const;

describe("parseModText — flat additions", () => {
  it("parses '+N to Maximum Life'", () => {
    const [m] = parseModText("+55 to maximum Life", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "life", value: 55 });
  });

  it("parses '+X% to Cold Resistance'", () => {
    const [m] = parseModText("+29% to Cold Resistance", src());
    expect(m).toMatchObject({
      operator: "FLAT",
      target: "cold_resistance",
      value: 29,
    });
  });

  it("parses '+N to Strength'", () => {
    const [m] = parseModText("+35 to Strength", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "strength", value: 35 });
  });

  it("parses '+X% to all Elemental Resistances'", () => {
    const [m] = parseModText("+15% to all Elemental Resistances", src());
    expect(m?.operator).toBe("FLAT");
    expect(m?.target).toBe("all_elemental_resistance");
    expect(m?.value).toBe(15);
  });

  it("parses negative values", () => {
    const [m] = parseModText("-4 to Strength", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "strength", value: -4 });
  });

  it("picks the high end of a (lo-hi) range", () => {
    const [m] = parseModText("+(40-60) to maximum Life", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "life", value: 60 });
  });
});

describe("parseModText — Adds X to Y damage", () => {
  it("parses physical attack damage with explicit numbers", () => {
    const [m] = parseModText("Adds 13 to 32 Physical Damage to Attacks", src());
    expect(m).toMatchObject({
      operator: "FLAT_RANGE",
      target: "physical_damage",
      value: 13,
      value_high: 32,
    });
  });

  it("parses fire damage with a range pair", () => {
    const [m] = parseModText("Adds (24-39) to (40-60) Fire damage to Attacks", src());
    expect(m).toMatchObject({
      operator: "FLAT_RANGE",
      target: "fire_damage",
      value: 39, // high end of low range
      value_high: 60,
    });
  });
});

describe("parseModText — increased/reduced/more/less", () => {
  it("parses 'X% increased Y'", () => {
    const [m] = parseModText("17% increased Rarity of Items found", src());
    expect(m).toMatchObject({
      operator: "INCREASED",
      target: "rarity_of_items",
      value: 17,
    });
  });

  it("parses '20% increased Magnitude of Damaging Ailments you inflict'", () => {
    const [m] = parseModText(
      "20% increased Magnitude of Damaging Ailments you inflict",
      src(),
    );
    expect(m?.operator).toBe("INCREASED");
    expect(m?.target).toBe("ailment_magnitude");
    expect(m?.value).toBe(20);
  });

  it("parses 'X% reduced Y'", () => {
    const [m] = parseModText("10% reduced Movement Speed", src());
    expect(m).toMatchObject({
      operator: "REDUCED",
      target: "movement_speed",
      value: 10,
    });
  });

  it("parses 'X% more Y'", () => {
    const [m] = parseModText("30% more Cold Damage", src());
    expect(m).toMatchObject({
      operator: "MORE",
      target: "cold_damage",
      value: 30,
    });
  });

  it("parses 'X% less Y'", () => {
    const [m] = parseModText("20% less Attack Speed", src());
    expect(m).toMatchObject({
      operator: "LESS",
      target: "attack_speed",
      value: 20,
    });
  });

  it("falls back to any_damage for unspecified increased Damage", () => {
    const [m] = parseModText("12% increased Damage", src());
    expect(m).toMatchObject({
      operator: "INCREASED",
      target: "any_damage",
      value: 12,
    });
  });
});

describe("parseModText — local item base stats", () => {
  it("parses 'Life: N' as a flat life roll", () => {
    const [m] = parseModText("Life: 644", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "life", value: 644 });
  });

  it("parses 'Energy Shield: N'", () => {
    const [m] = parseModText("Energy Shield: 76", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "energy_shield", value: 76 });
  });

  it("parses 'Evasion: N'", () => {
    const [m] = parseModText("Evasion: 1778", src());
    expect(m).toMatchObject({ operator: "FLAT", target: "evasion", value: 1778 });
  });
});

describe("parseModText — crit and speed", () => {
  it("parses '+X% to Critical Damage Bonus'", () => {
    const [m] = parseModText("+25% to Critical Damage Bonus", src());
    expect(m).toMatchObject({
      operator: "FLAT",
      target: "crit_damage",
      value: 25,
    });
  });

  it("parses 'X% increased Critical Hit Chance for Attacks'", () => {
    const [m] = parseModText("38% increased Critical Hit Chance for Attacks", src());
    expect(m).toMatchObject({
      operator: "INCREASED",
      target: "crit_chance",
      value: 38,
    });
  });

  it("parses attack speed", () => {
    const [m] = parseModText("26% increased Attack Speed", src());
    expect(m).toMatchObject({
      operator: "INCREASED",
      target: "attack_speed",
      value: 26,
    });
  });
});

describe("parseModText — UNKNOWN fallback", () => {
  it("returns an UNKNOWN entry for unmatched text but never crashes", () => {
    const [m] = parseModText(
      "When you kill a Rare monster, you gain its Modifiers for 60 seconds",
      src(),
    );
    expect(m?.operator).toBe("UNKNOWN");
    expect(m?.source_text).toContain("Rare monster");
  });

  it("returns empty array for empty text", () => {
    expect(parseModText("", src())).toEqual([]);
    expect(parseModText("   ", src())).toEqual([]);
  });
});
