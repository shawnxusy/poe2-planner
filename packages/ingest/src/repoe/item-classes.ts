import { db, itemClasses } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// item_classes.min.json: dict keyed by item_class string ("LifeFlask", "Bow"...)
// containing { name, category, category_id }. A small number of placeholder
// entries (e.g., DONOTUSE5) exist; we store them anyway since they're cheap
// and filtering them might surprise a future query.
interface RepoeItemClass {
  name: string;
  category?: string;
  category_id?: string;
}

export async function ingestItemClasses(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeItemClass>>(
    repoeUrl("item_classes.min.json"),
  );

  const rows = Object.entries(data).map(([key, ic]) => ({
    patch_version_id: patchVersionId,
    key,
    name: ic.name,
    category: ic.category ?? null,
    category_id: ic.category_id ?? null,
    raw: ic as unknown as Record<string, unknown>,
  }));

  await db
    .insert(itemClasses)
    .values(rows)
    .onConflictDoUpdate({
      target: [itemClasses.patch_version_id, itemClasses.key],
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        category_id: sql`excluded.category_id`,
        raw: sql`excluded.raw`,
      },
    });

  info("item_classes: upserted", { count: rows.length });
  return rows.length;
}
