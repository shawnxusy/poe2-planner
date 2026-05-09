// Diagnostic: dump the most-common passive stat IDs in a fixture so we know
// which RePoE stat IDs the resolver must handle. Not part of the test suite —
// run on demand: `npx tsx scripts/dump-passives.ts <fixture>`
// Load env before importing the DB client (which throws if DATABASE_URL is unset).
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

  const counts = new Map<
    string,
    { count: number; example_value: number; example_node: string; total: number }
  >();
  for (const p of build.passives) {
    const hash = Number.parseInt(p.node_id, 10);
    const rec = game.passives_by_hash.get(hash);
    if (!rec) continue;
    for (const sid of rec.stat_ids) {
      const val = rec.stats_values[sid] ?? 0;
      const cur = counts.get(sid) ?? {
        count: 0,
        example_value: val,
        example_node: rec.name,
        total: 0,
      };
      cur.count += 1;
      cur.total += val;
      counts.set(sid, cur);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`Unique stat_ids: ${sorted.length}`);
  for (const [sid, info] of sorted) {
    console.log(
      `${sid.padEnd(58)} count=${String(info.count).padStart(3)}  total=${String(info.total).padStart(5)}  e.g. ${info.example_node}=${info.example_value}`,
    );
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
