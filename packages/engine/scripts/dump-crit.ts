// Diagnostic: list every crit_chance/crit_damage/attack_speed entry the
// resolver produced, so we can audit the source of drift vs. PoB.
import { readFileSync } from "node:fs";
import { decodePobCode } from "../src/pob/codec.js";
import { parsePobXml } from "../src/pob/xml.js";
import { xmlToBuildInput } from "../src/pob/build-input.js";
import { loadGameData } from "../src/data/load.js";
import { resolve } from "../src/modifiers/resolver.js";

async function main() {
  const fixture = process.argv[2] ?? "test-fixtures/ice-strike-1.txt";
  const code = readFileSync(fixture, "utf-8").trim();
  const { build } = xmlToBuildInput(parsePobXml(decodePobCode(code)));
  const game = await loadGameData();
  const r = resolve(build, game);

  const targets = ["crit_chance", "crit_damage", "attack_speed", "skill_speed", "strength", "dexterity", "intelligence"];
  for (const t of targets) {
    console.log(`=== ${t} ===`);
    const ents = r.mods.entries.filter((e) => e.target === t);
    for (const e of ents) {
      console.log(
        `  ${e.operator.padEnd(10)} ${String(e.value).padStart(7)}  scope=${e.scope.padEnd(8)}  tags=[${e.tags.join(",")}]  src=${e.source.kind}/${e.source.ref ?? ""}  text="${e.source_text}"`,
      );
    }
    const incSum = ents.filter((e) => e.operator === "INCREASED" && e.scope !== "minion" && e.scope !== "ailment").reduce((a, b) => a + b.value, 0);
    const flatSum = ents.filter((e) => e.operator === "FLAT" && e.scope !== "minion" && e.scope !== "ailment").reduce((a, b) => a + b.value, 0);
    console.log(`  TOTALS: increased=${incSum}, flat=${flatSum}`);
    console.log();
  }
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
