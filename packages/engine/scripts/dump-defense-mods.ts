// Diagnostic: dump every entry contributing to a given defense pool.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";
import { resolve } from "../src/modifiers/resolver.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/poison-build-1.txt";
  const target = process.argv[3] ?? "evasion";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();
  const r = resolve(build, game);

  console.log(`=== mods targeting "${target}" ===`);
  let flat = 0;
  let inc = 0;
  for (const e of r.mods.entries) {
    if (e.target !== target) continue;
    console.log(
      `  ${e.operator.padEnd(10)} ${String(e.value).padStart(6)}  scope=${e.scope.padEnd(8)}  src=${e.source.kind}/${e.source.ref ?? ""}  text="${e.source_text}"`,
    );
    if (e.operator === "FLAT") flat += e.value;
    if (e.operator === "INCREASED") inc += e.value;
    if (e.operator === "REDUCED") inc -= e.value;
  }
  console.log(`  TOTALS: flat=${flat}, increased=${inc}%`);
  console.log(`  base + flat = ${flat}, * (1+${inc}/100) = ${(flat * (1 + inc / 100)).toFixed(0)}`);
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
