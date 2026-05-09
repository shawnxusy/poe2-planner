// Diagnostic: run computeHit() against a fixture and print every layer
// of the damage pipeline so we can compare against PoB's tooltip values.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";
import { resolve } from "../src/modifiers/resolver.js";
import { computeHit } from "../src/damage/hit.js";
import { computeAttributes } from "../src/damage/attributes.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/ice-strike-1.txt";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();
  const r = resolve(build, game);
  const hit = computeHit({ build, game, mods: r.mods });
  const attrs = computeAttributes(build, r.mods.entries);

  console.log("=== Build ===");
  console.log(`  ${build.character_class} / ${build.ascendancy}, lvl ${build.level}`);
  console.log(`  Str/Dex/Int = ${attrs.strength}/${attrs.dexterity}/${attrs.intelligence}`);
  console.log();
  console.log("=== Damage layers ===");
  for (const e of ["physical", "fire", "cold", "lightning", "chaos"] as const) {
    const base = hit.layers.base[e];
    const flat = hit.layers.after_flat[e];
    const conv = hit.layers.after_conversion[e];
    const inc = hit.layers.after_increased[e];
    const more = hit.layers.after_more[e];
    const incPct = hit.layers.increased_pct[e];
    const moreFactor = hit.layers.more_factor[e];
    console.log(
      `  ${e.padEnd(10)} base=${fmt(base)} flat=${fmt(flat)} conv=${fmt(conv)} inc=${incPct.toFixed(0)}% more=${moreFactor.toFixed(2)}x → final=${fmt(more)}`,
    );
  }
  console.log();
  console.log("=== Hit summary ===");
  console.log(`  Average non-crit: ${hit.average_non_crit.toFixed(0)}`);
  console.log(`  Crit chance:      ${(hit.crit_chance * 100).toFixed(2)}%  (target 75.45%)`);
  console.log(`  Crit multi:       ${hit.crit_multiplier.toFixed(2)}x      (target 5.29x)`);
  console.log(`  Average hit:      ${hit.average_hit.toFixed(0)}  (target 145,162)`);
  console.log(`  Attack speed:     ${hit.attack_speed.toFixed(3)}   (target 3.097)`);
  console.log(`  Combined DPS:     ${hit.combined_dps.toFixed(0)}   (target 449,538)`);
  console.log();
  console.log("=== Drift ===");
  const targetAvg = 145162;
  const targetDPS = 449538;
  console.log(`  Avg-hit drift:    ${((hit.average_hit / targetAvg - 1) * 100).toFixed(1)}%`);
  console.log(`  DPS drift:        ${((hit.combined_dps / targetDPS - 1) * 100).toFixed(1)}%`);
}

function fmt(r: { min: number; max: number }): string {
  return `[${r.min.toFixed(0)}-${r.max.toFixed(0)}]`;
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
