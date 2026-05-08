import { db, uniqueItems } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// uniques.min.json gives only existence metadata — id, display name, item
// class, inventory size, art reference. Critically: NO STATS. The unique's
// stat block is hand-curated in PathOfBuilding-PoE2's Lua data files; a
// later ingest step parses those to enrich `stats` and resolve `base_item_id`.
//
// For now we store id/name/item_class so the build catalog UI can at least
// show "this build uses Headhunter" without breaking foreign keys later.
//
// The JSON keys here are arbitrary integers; the stable identifier is `id`.
interface RepoeUnique {
  id: string;
  name: string;
  item_class: string;
  inventory_width?: number;
  inventory_height?: number;
  is_alternate_art?: boolean;
  visual_identity?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function ingestUniques(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeUnique>>(
    repoeUrl("uniques.min.json"),
  );

  // Several uniques have alt-art duplicates with the same `id`. Prefer the
  // non-alt-art version (Headhunter normal beats Headhunter alt-art); first
  // wins among ties.
  const byId = new Map<string, RepoeUnique>();
  for (const u of Object.values(data)) {
    const existing = byId.get(u.id);
    if (!existing || (existing.is_alternate_art && !u.is_alternate_art)) {
      byId.set(u.id, u);
    }
  }

  const rows = Array.from(byId.values()).map((u) => ({
    patch_version_id: patchVersionId,
    metadata_id: u.id,
    name: u.name,
    base_item_id: null,
    stats: [] as string[],
    release_state: null,
    raw: u as unknown as Record<string, unknown>,
  }));

  await db
    .insert(uniqueItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [uniqueItems.patch_version_id, uniqueItems.metadata_id],
      set: {
        name: sql`excluded.name`,
        raw: sql`excluded.raw`,
      },
    });

  info("uniques: upserted", { count: rows.length });
  return rows.length;
}
