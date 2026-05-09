import { describe, expect, it } from "vitest";
import { parseModText } from "./parser.js";
import { categorize, selectMods } from "./categorize.js";

const src = (kind: "explicit" | "passive" = "explicit", ref = "test") =>
  ({ kind, ref }) as const;

describe("categorize", () => {
  it("assigns 'defense' to life/ES/resistance mods", () => {
    const cat = categorize(parseModText("+55 to maximum Life", src()));
    expect(cat[0]?.scope).toBe("defense");
    const cat2 = categorize(parseModText("+29% to Cold Resistance", src()));
    expect(cat2[0]?.scope).toBe("defense");
  });

  it("assigns 'ailment' to poison/ignite/bleed targets", () => {
    const cat = categorize(parseModText("22% chance to Poison on Hit", src()));
    expect(cat[0]?.scope).toBe("ailment");
    const cat2 = categorize(
      parseModText("20% increased Magnitude of Damaging Ailments you inflict", src()),
    );
    expect(cat2[0]?.scope).toBe("ailment");
  });

  it("assigns 'hit' when a damage mod has spell/attack tag", () => {
    const mods = parseModText("12% increased Cold Damage", src());
    mods.forEach((m) => m.tags.push("spell"));
    const cat = categorize(mods);
    expect(cat[0]?.scope).toBe("hit");
  });

  it("assigns 'both' to generic damage mods without spell/attack tags", () => {
    const cat = categorize(parseModText("12% increased Cold Damage", src()));
    expect(cat[0]?.scope).toBe("both");
  });

  it("assigns 'hit' to crit and speed targets", () => {
    const cat = categorize(parseModText("38% increased Critical Hit Chance for Attacks", src()));
    expect(cat[0]?.scope).toBe("hit");
    const cat2 = categorize(parseModText("26% increased Attack Speed", src()));
    expect(cat2[0]?.scope).toBe("hit");
  });

  it("assigns 'utility' to triggered effects and unknown mods", () => {
    const cat = categorize(parseModText("When you kill a Rare monster, you gain stuff", src()));
    expect(cat[0]?.scope).toBe("utility");
    const cat2 = categorize(parseModText("Some unrecognized text format", src()));
    expect(cat2[0]?.scope).toBe("utility");
  });

  it("assigns 'global' to attribute and skill-level mods", () => {
    const cat = categorize(parseModText("+35 to Strength", src()));
    expect(cat[0]?.scope).toBe("global");
    const cat2 = categorize(parseModText("+7 to Level of all Melee Skills", src()));
    expect(cat2[0]?.scope).toBe("global");
  });

  it("respects existing non-global scope (resolver-assigned)", () => {
    const mods = parseModText("12% increased Cold Damage", src());
    mods[0]!.scope = "minion";
    const cat = categorize(mods);
    expect(cat[0]?.scope).toBe("minion");
  });
});

describe("selectMods", () => {
  it("filters by scope", () => {
    const all = categorize([
      ...parseModText("+55 to maximum Life", src()),
      ...parseModText("12% increased Cold Damage", src()),
      ...parseModText("26% increased Attack Speed", src()),
    ]);
    expect(selectMods(all, "defense").length).toBe(1);
    expect(selectMods(all, ["hit", "both"]).length).toBe(2);
  });

  it("filters by target too", () => {
    const all = categorize([
      ...parseModText("+55 to maximum Life", src()),
      ...parseModText("+200 to maximum Life", src()),
      ...parseModText("+29% to Cold Resistance", src()),
    ]);
    const lifeOnly = selectMods(all, "defense", "life");
    expect(lifeOnly.length).toBe(2);
  });
});
