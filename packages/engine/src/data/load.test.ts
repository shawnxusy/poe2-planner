// Integration test: load game data from the live DB, then confirm that
// every passive hash and skill metadata_id our fixture references actually
// resolves. If this regresses, the engine can't resolve build inputs.

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";

import { decodePobCode } from "../pob/codec.js";
import { parsePobXml } from "../pob/xml.js";
import { xmlToBuildInput } from "../pob/build-input.js";
import { loadGameData } from "./load.js";
import type { GameData } from "./types.js";

const fixturePath = resolve(__dirname, "../../test-fixtures/poison-build-1.txt");

describe("loadGameData — integration with live DB", () => {
  let game: GameData;
  beforeAll(async () => {
    game = await loadGameData();
  }, 30000);

  it("loads a non-empty game-data snapshot for the current patch", () => {
    expect(game.patch_tag).toBe("0.4");
    expect(game.passives_by_hash.size).toBeGreaterThan(4000);
    expect(game.skills_by_metadata_id.size).toBeGreaterThan(1000);
    expect(game.mods_by_metadata_id.size).toBeGreaterThan(10000);
  });

  it("resolves every passive hash in the poison-build-1 fixture", () => {
    const code = readFileSync(fixturePath, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
    const unresolved: string[] = [];
    for (const p of build.passives) {
      const hash = Number.parseInt(p.node_id, 10);
      if (!game.passives_by_hash.has(hash)) unresolved.push(p.node_id);
    }
    if (unresolved.length > 0) {
      console.log("Unresolved passives (first 10):", unresolved.slice(0, 10));
    }
    // 100% match expected — the passive tree ingest should cover every node.
    expect(unresolved.length).toBe(0);
    expect(build.passives.length).toBe(161);
  });

  it("resolves the main skill (Poisonburst Arrow) and key supports", () => {
    const code = readFileSync(fixturePath, "utf-8").trim();
    const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));

    const main = build.skills.find((s) => s.skill_id === "PoisonBurstArrowPlayer");
    expect(main).toBeDefined();
    expect(game.skills_by_metadata_id.has(main!.skill_id)).toBe(true);
    const skillRec = game.skills_by_metadata_id.get(main!.skill_id);
    expect(skillRec?.name).toBe("Poisonburst Arrow");

    // Every support in the main skill group should resolve too.
    const unresolved = main!.supports
      .filter((s) => !game.skills_by_metadata_id.has(s.support_id))
      .map((s) => s.support_id);
    expect(unresolved).toEqual([]);
  });
});
