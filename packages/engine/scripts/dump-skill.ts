// Diagnostic: print the skill metadata + main weapon for a fixture's main
// active skill so we know the base damage shape we're working with.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/ice-strike-1.txt";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();

  console.log(`Class: ${build.character_class} / ${build.ascendancy}`);
  console.log(`Level: ${build.level}`);
  console.log();
  console.log("=== Skills ===");
  for (const s of build.skills) {
    console.log(`  ${s.skill_id} (lvl ${s.level}, role=${s.role}, links=${s.links})`);
    for (const sup of s.supports) {
      console.log(`    + ${sup.support_id} (lvl ${sup.level})`);
    }
  }

  console.log();
  console.log("=== Items (slot, base, rarity) ===");
  for (const it of build.items) {
    console.log(`  [${it.slot.padEnd(12)}] ${it.rarity.padEnd(6)} ${it.base_item}${it.unique_name ? ` <${it.unique_name}>` : ""}`);
  }

  console.log();
  console.log("=== Main skill metadata ===");
  const main = build.skills.find((s) => s.role === "main") ?? build.skills[0];
  if (main) {
    const rec = game.skills_by_metadata_id.get(main.skill_id);
    if (rec) {
      console.log(`  name: ${rec.name}`);
      console.log(`  gem_type: ${rec.gem_type}`);
      console.log(`  tags: ${rec.tags.join(", ")}`);
      const lvl = main.level;
      // PoE2 RePoE shape: per_level is a flat dict keyed by stat name with
      // value arrays indexed by gem_level - 1. We print the row for the gem's
      // configured level + the keys overall.
      const pl = rec.per_level as unknown as Record<string, unknown>;
      console.log(`  per_level top-level keys: ${Object.keys(pl).slice(0, 5).join(", ")}…`);
      console.log(`  per_level["${lvl}"]:\n${JSON.stringify(pl[String(lvl)], null, 2)}`);
      console.log(`  static: ${JSON.stringify(rec.static, null, 2)}`);
    } else {
      console.log(`  <not found in game data: ${main.skill_id}>`);
    }
  }

  console.log();
  console.log("=== Weapon item ===");
  const weapon = build.items.find((i) => i.slot === "weapon");
  if (weapon) {
    console.log(`  base: ${weapon.base_item}, rarity: ${weapon.rarity}`);
    console.log(`  implicits:`);
    for (const im of weapon.implicits) console.log(`    ${im.text}`);
    console.log(`  affixes:`);
    for (const af of weapon.affixes) console.log(`    ${af.text}`);
  } else {
    console.log("  <no weapon — unarmed?>");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
