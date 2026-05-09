// Diagnostic: run the resolver against a fixture and report what
// resolved + what didn't. Run on demand:
//   node --env-file=../../.env --import tsx scripts/dump-resolver.ts [fixture]
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";
import { coverageReport, resolve } from "../src/modifiers/resolver.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/ice-strike-1.txt";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();
  const r = resolve(build, game);
  const cov = coverageReport(r);

  console.log("=== Coverage ===");
  console.log(cov);
  console.log();
  console.log(`=== Mod scope distribution (${r.mods.entries.length} total) ===`);
  const byScope = new Map<string, number>();
  for (const e of r.mods.entries) byScope.set(e.scope, (byScope.get(e.scope) ?? 0) + 1);
  for (const [k, v] of byScope) console.log(`  ${k.padEnd(10)} ${v}`);

  console.log();
  console.log(`=== Top targets ===`);
  const byTarget = new Map<string, number>();
  for (const e of r.mods.entries) byTarget.set(e.target, (byTarget.get(e.target) ?? 0) + 1);
  const sorted = [...byTarget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [k, v] of sorted) console.log(`  ${k.padEnd(28)} ${v}`);

  console.log();
  console.log(`=== Unresolved passive stats (${r.unresolved_passive_stats.length}) ===`);
  for (const u of r.unresolved_passive_stats.slice(0, 20)) {
    console.log(`  ${u.stat_id.padEnd(50)} value=${u.value} (${u.node})`);
  }

  console.log();
  console.log(`=== Unresolved item text (${r.unresolved_item_text.length}) ===`);
  for (const u of r.unresolved_item_text.slice(0, 20)) {
    console.log(`  [${u.slot.padEnd(12)}] ${u.text}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
