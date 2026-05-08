import { db, tagsTable } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// tags.min.json is a flat object keyed by tag string. Values vary per tag
// — sometimes a single string, sometimes an object — so we just preserve the
// raw record and key on the tag string itself.
type RepoeTagsFile = Record<string, unknown>;

export async function ingestTags(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<RepoeTagsFile>(repoeUrl("tags.min.json"));

  const rows = Object.entries(data).map(([key, raw]) => ({
    patch_version_id: patchVersionId,
    key,
    raw: (raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : { value: raw }) as Record<string, unknown>,
  }));

  await db
    .insert(tagsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [tagsTable.patch_version_id, tagsTable.key],
      set: { raw: sql`excluded.raw` },
    });

  info("tags: upserted", { count: rows.length });
  return rows.length;
}
