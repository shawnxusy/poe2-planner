// Diagnostic: run the defense path against a fixture and report each
// pool + resistances + EHP, alongside the PoB-embedded targets.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";
import { resolve } from "../src/modifiers/resolver.js";
import { computeDefense } from "../src/defense/index.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/poison-build-1.txt";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();
  const r = resolve(build, game);
  const defense = computeDefense(build, r.mods);

  console.log(`=== ${build.character_class} / ${build.ascendancy}, lvl ${build.level} ===`);
  console.log();
  console.log("=== Pools ===");
  console.log(`  Life:           ${defense.life}`);
  console.log(`  Energy Shield:  ${defense.es}`);
  console.log(`  Armour:         ${defense.armour} (DR ${defense.armour_dr_pct.toFixed(1)}%)`);
  console.log(`  Evasion:        ${defense.evasion} (dodge ${defense.evasion_chance_pct.toFixed(1)}%)`);
  console.log();
  console.log("=== Resistances ===");
  const r2 = defense.resistances;
  console.log(`  Fire:      ${r2.fire}/${r2.fire_max}`);
  console.log(`  Cold:      ${r2.cold}/${r2.cold_max}`);
  console.log(`  Lightning: ${r2.lightning}/${r2.lightning_max}`);
  console.log(`  Chaos:     ${r2.chaos}/${r2.chaos_max}`);
  console.log();
  console.log("=== EHP ===");
  console.log(`  Combined: ${defense.ehp}`);
  console.log();
  console.log("=== PoB targets (poison-build-1) ===");
  console.log("  Life=1644 ES=3194 Mana=699 Evasion=27167 Armour=0");
  console.log("  Fire=74 Cold=75(+6) Lightning=75(+8) Chaos=37");
  console.log("  TotalEHP=38637");
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
