import { db, baseItems, uniqueItems } from "@poe2/db";
import { and, eq, sql } from "drizzle-orm";
import { fetchTextCached } from "../lib/fetch-cache.js";
import { info, warn } from "../lib/log.js";
import { POB_UNIQUE_FILES, pobUniquesUrl } from "./source.js";
import { parseUniquesFile } from "./parse-uniques.js";

// Enrich the unique_items rows ingested from RePoE with stats and a
// base_item_id FK. Match strategy:
//   - by exact name → unique_items.metadata_id
//   - by base name → base_items.name (within the current patch)
// Some PoB-only uniques (or uniques RePoE renames between patches) might
// not match RePoE — those are logged but not fatal. RePoE-only uniques
// keep their empty stats array; nothing breaks.
export async function ingestPobUniques(patchVersionId: number): Promise<number> {
  // Pre-fetch the existing unique_items + base_items maps once so per-row
  // updates don't re-query the DB.
  const existingUniques = await db
    .select({ id: uniqueItems.id, metadata_id: uniqueItems.metadata_id, name: uniqueItems.name })
    .from(uniqueItems)
    .where(eq(uniqueItems.patch_version_id, patchVersionId));
  const uniqueByName = new Map(existingUniques.map((u) => [u.name, u]));

  const existingBases = await db
    .select({ id: baseItems.id, name: baseItems.name })
    .from(baseItems)
    .where(eq(baseItems.patch_version_id, patchVersionId));
  const baseByName = new Map(existingBases.map((b) => [b.name, b.id]));

  let parsed = 0;
  let matched = 0;
  let unmatchedUnique = 0;
  let unmatchedBase = 0;

  for (const file of POB_UNIQUE_FILES) {
    const lua = await fetchTextCached(pobUniquesUrl(file));
    const items = parseUniquesFile(lua);
    parsed += items.length;

    for (const item of items) {
      const existing = uniqueByName.get(item.name);
      if (!existing) {
        unmatchedUnique++;
        continue;
      }
      matched++;

      const baseId = baseByName.get(item.base_item_name) ?? null;
      if (baseId === null) unmatchedBase++;

      const stats = item.mods.map((m) => m.text);
      const rawAddition = {
        pob_lua: item.raw_lua,
        pob_mods: item.mods,
        pob_variants: item.variants,
        pob_source: item.source,
        pob_league: item.league,
        pob_implicit_count: item.implicit_count,
      };

      await db
        .update(uniqueItems)
        .set({
          stats,
          base_item_id: baseId,
          // Merge new fields into existing raw blob without losing RePoE data.
          raw: sql`${uniqueItems.raw} || ${JSON.stringify(rawAddition)}::jsonb`,
        })
        .where(eq(uniqueItems.id, existing.id));
    }
  }

  info("pob/uniques: enriched", {
    parsed,
    matched,
    unmatchedUnique,
    unmatchedBase,
  });
  if (unmatchedUnique > 0) {
    warn("pob/uniques: some PoB uniques have no matching RePoE entry", {
      count: unmatchedUnique,
    });
  }

  return matched;
}
