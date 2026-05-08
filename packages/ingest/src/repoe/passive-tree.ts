import { db, passives } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// PoE2's passive tree comes from RePoE-Fork's passive_skill_trees/Default.json
// (NOT the PoE1 grindinggear/skilltree-export repo). The map is keyed by the
// numeric `hash`; each entry's `id` is the stable string identifier we store
// as `node_id`.
//
// Position (x, y) requires computing from group center + orbit_radius + orbit
// index per the tree geometry — deferred until we actually render the tree.
// Stored as 0/0 placeholder so engine queries (stat resolution) work today.
//
// `stats` is a dict on each passive — we store the keys in the indexed
// `stats text[]` column for search; full {stat_id: value} structure stays
// in `raw` so the engine can read magnitudes.
interface RepoePassive {
  hash: number;
  id: string;
  name: string;
  is_keystone?: boolean;
  is_notable?: boolean;
  is_jewel_socket?: boolean;
  is_ascendancy_starting_node?: boolean;
  is_multiple_choice?: boolean;
  is_multiple_choice_option?: boolean;
  is_atlas_root?: boolean;
  is_icon_only?: boolean;
  is_free?: boolean;
  stats?: Record<string, number>;
  reminder_text?: string[];
  flavour_text?: string;
  icon?: string;
  skill_points?: number;
  weapon_set_points?: number;
  [key: string]: unknown;
}

interface RepoeTreeFile {
  passives: Record<string, RepoePassive>;
  [key: string]: unknown;
}

function deriveType(p: RepoePassive): string {
  if (p.is_keystone) return "keystone";
  if (p.is_notable) return "notable";
  if (p.is_jewel_socket) return "jewel_socket";
  if (p.is_ascendancy_starting_node) return "ascendancy_start";
  if (p.is_multiple_choice || p.is_multiple_choice_option) return "multiple_choice";
  return "normal";
}

export async function ingestPassiveTree(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<RepoeTreeFile>(
    repoeUrl("passive_skill_trees/Default.min.json"),
  );

  const rows = Object.values(data.passives).map((p) => ({
    patch_version_id: patchVersionId,
    node_id: p.id,
    name: p.name,
    type: deriveType(p),
    stats: Object.keys(p.stats ?? {}),
    x: 0,
    y: 0,
    raw: p as unknown as Record<string, unknown>,
  }));

  const CHUNK = 2000;
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

  info("passives: upserted", { count: rows.length });
  return rows.length;
}
