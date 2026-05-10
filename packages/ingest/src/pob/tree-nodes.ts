// Populate passive tree graph nodes from PoB's tree.lua.
//
// Rather than trying to UPDATE RePoE rows (which use stat-key node IDs that
// don't match PoB's integer skill IDs), we UPSERT all PoB nodes with
// node_id = String(skill) — the plain integer as a string. This keeps the
// integer IDs intact so the connections[] array can be resolved by
// passive-tree-graph.ts using byNumericId.
//
// Ascendancy nodes that already exist as "pob_asc_<skill>" from
// ingestAscendancyNodes are updated in place (connections + x/y filled in).
//
// Output of dump-tree-nodes.lua is NDJSON (one JSON object per line).

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, passives } from "@poe2/db";
import { sql } from "drizzle-orm";
import { info } from "../lib/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_SCRIPT = resolve(
  __dirname,
  "../../../../packages/engine/lua-bridge/dump-tree-nodes.lua",
);

const POB_ROOT = process.env.POB_ROOT ?? "/tmp/pob-poe2";
const TREE_LUA = `${POB_ROOT}/src/TreeData/0_4/tree.lua`;

interface DumpNode {
  skill: string;
  name: string;
  type: string;
  x: number;
  y: number;
  connections: number[];
  stats: string[];
  ascendancy_name?: string;
  is_keystone?: boolean;
  is_notable?: boolean;
}

function runDump(): DumpNode[] {
  const stdout = execSync(`luajit "${DUMP_SCRIPT}" "${TREE_LUA}"`, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  }).toString("utf-8");

  return stdout
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as DumpNode);
}

export async function ingestTreeNodes(patchVersionId: number): Promise<number> {
  const nodes = runDump();
  info("pob/tree-nodes: dump complete", { count: nodes.length });

  // Step 1: update connections on existing pob_asc_<skill> rows.
  // These were inserted by ingestAscendancyNodes and have rich stat data;
  // we just need to fill in x/y/connections.
  const ascNodes = nodes.filter((n) => n.ascendancy_name);
  if (ascNodes.length > 0) {
    const valuesSql = sql.join(
      ascNodes.map((node) =>
        sql`(
          ${"pob_asc_" + node.skill}::text,
          ${Math.round(node.x)}::integer,
          ${Math.round(node.y)}::integer,
          ${sql`ARRAY[${sql.join(node.connections.map((c) => sql`${c}`), sql`, `)}]::integer[]`}
        )`,
      ),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE ${passives} AS p
      SET x = v.x, y = v.y, connections = v.connections
      FROM (VALUES ${valuesSql}) AS v(node_id, x, y, connections)
      WHERE p.patch_version_id = ${patchVersionId} AND p.node_id = v.node_id
    `);
  }

  // Step 2: upsert all nodes with node_id = String(skill) so the connections[]
  // integer array can be resolved by the graph. Use chunks of 500 to stay under
  // Postgres parameter limits.
  const CHUNK = 500;
  let upserted = 0;

  for (let i = 0; i < nodes.length; i += CHUNK) {
    const slice = nodes.slice(i, i + CHUNK);
    const rows = slice.map((n) => ({
      patch_version_id: patchVersionId,
      node_id: n.skill, // plain integer string, e.g. "12345"
      name: n.name,
      type: n.type,
      stats: n.stats,
      x: Math.round(n.x),
      y: Math.round(n.y),
      connections: n.connections,
      raw: n as unknown as Record<string, unknown>,
    }));

    const result = await db
      .insert(passives)
      .values(rows)
      .onConflictDoUpdate({
        target: [passives.patch_version_id, passives.node_id],
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          stats: sql`excluded.stats`,
          x: sql`excluded.x`,
          y: sql`excluded.y`,
          connections: sql`excluded.connections`,
          raw: sql`excluded.raw`,
        },
      });

    upserted += (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  info("pob/tree-nodes: upserted", { upserted, total: nodes.length });
  return upserted;
}
