import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, passives } from "@poe2/db";
import { sql } from "drizzle-orm";
import { info } from "../lib/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_SCRIPT = resolve(
  __dirname,
  "../../../../packages/engine/lua-bridge/dump-ascendancy-nodes.lua",
);

const POB_ROOT = process.env.POB_ROOT ?? "/tmp/pob-poe2";
const TREE_LUA = `${POB_ROOT}/src/TreeData/0_4/tree.lua`;

interface AscendancyNode {
  skill: string;
  name: string;
  ascendancy_name: string;
  is_notable: boolean;
  is_keystone: boolean;
  stats: string[];
}

function runDump(): AscendancyNode[] {
  const stdout = execSync(`luajit "${DUMP_SCRIPT}" "${TREE_LUA}"`, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  }).toString("utf-8");

  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1];
  if (!last) throw new Error("dump-ascendancy-nodes.lua produced no output");
  return JSON.parse(last) as AscendancyNode[];
}

export async function ingestAscendancyNodes(patchVersionId: number): Promise<number> {
  const nodes = runDump();

  const rows = nodes.map((n) => ({
    patch_version_id: patchVersionId,
    node_id: `pob_asc_${n.skill}`,
    name: n.name,
    type: n.is_keystone
      ? "ascendancy_keystone"
      : n.is_notable
        ? "ascendancy_notable"
        : "ascendancy_normal",
    stats: n.stats,
    x: 0,
    y: 0,
    raw: n as unknown as Record<string, unknown>,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(passives)
      .values(slice)
      .onConflictDoUpdate({
        target: [passives.patch_version_id, passives.node_id],
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          stats: sql`excluded.stats`,
          raw: sql`excluded.raw`,
        },
      });
  }

  info("pob/ascendancy-nodes: upserted", { count: rows.length });
  return rows.length;
}
