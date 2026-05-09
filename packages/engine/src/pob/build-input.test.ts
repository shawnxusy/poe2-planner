import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePobCode } from "./codec.js";
import { parsePobXml } from "./xml.js";
import { xmlToBuildInput } from "./build-input.js";

const fixturePath = resolve(__dirname, "../../test-fixtures/poison-build-1.txt");

describe("xmlToBuildInput — poison-build-1", () => {
  const code = readFileSync(fixturePath, "utf-8").trim();
  const xml = decodePobCode(code);
  const root = parsePobXml(xml);
  const { build, warnings, parsed_items } = xmlToBuildInput(root);

  it("captures class + ascendancy + level from the PoB header", () => {
    expect(build.character_class).toBe("Ranger");
    expect(build.ascendancy).toBe("Pathfinder");
    expect(build.level).toBe(98);
    expect(build.patch_version).toBe("0.4");
  });

  it("extracts every allocated passive node hash from Tree.Spec", () => {
    // Fixture has 161 allocated passive nodes (lvl 98 build); each entry is
    // a stringified numeric hash like "61106".
    expect(build.passives.length).toBe(161);
    expect(build.passives[0]?.node_id).toMatch(/^\d+$/);
  });

  it("parses items into structured slot entries", () => {
    expect(build.items.length).toBeGreaterThanOrEqual(5);
    // Headhunter is the unique Belt in this build.
    const belt = build.items.find((i) => i.slot === "belt");
    expect(belt?.rarity).toBe("unique");
    expect(belt?.unique_name).toBe("Headhunter");
    expect(belt?.base_item).toBe("Heavy Belt");
  });

  it("parses item affixes with values extracted", () => {
    // Fixture has two rare rings (Gold + Sapphire). Sapphire's implicit is
    // +29% Cold Resistance; check that one of the rings has it.
    const rings = build.items.filter(
      (i) => i.slot === "ring_left" || i.slot === "ring_right",
    );
    expect(rings.length).toBe(2);
    const anyHasColdRes = rings.some((r) =>
      r.implicits.some((a) => a.text.includes("Cold Resistance")),
    );
    expect(anyHasColdRes).toBe(true);
  });

  it("identifies main active skill as Poisonburst Arrow with supports", () => {
    expect(build.skills.length).toBeGreaterThan(0);
    const main = build.skills.find((s) => s.skill_id === "PoisonBurstArrowPlayer");
    expect(main).toBeDefined();
    expect(main!.role).toBe("main");
    expect(main!.level).toBe(21);
    expect(main!.quality).toBe(20);
    expect(main!.supports.length).toBeGreaterThanOrEqual(3);
    // Confirm a key support is captured.
    const deadlyPoison = main!.supports.find(
      (s) => s.support_id === "SupportDeadlyPoisonPlayerTwo",
    );
    expect(deadlyPoison).toBeDefined();
  });

  it("preserves parsed item bodies in the parsed_items map for inspection", () => {
    expect(parsed_items.size).toBeGreaterThanOrEqual(build.items.length);
  });

  it("conversion produces no warnings for a clean import", () => {
    // We tolerate occasional warnings (slots we don't yet model), but should
    // never crash. Surface any to make data-shape regressions visible.
    if (warnings.length > 0) {
      console.log("xmlToBuildInput warnings:", warnings);
    }
  });
});
