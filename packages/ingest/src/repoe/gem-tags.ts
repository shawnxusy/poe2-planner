import { db, gemTags } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// gem_tags.min.json is a flat object: { "fire": "[Fire]", "cold": "[Cold]", ... }
type GemTagsFile = Record<string, string>;

export async function ingestGemTags(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<GemTagsFile>(repoeUrl("gem_tags.min.json"));
  const rows = Object.entries(data).map(([key, translation]) => ({
    patch_version_id: patchVersionId,
    key,
    translation,
  }));

  if (rows.length === 0) {
    info("gem_tags: 0 rows from upstream — skipping");
    return 0;
  }

  await db
    .insert(gemTags)
    .values(rows)
    .onConflictDoUpdate({
      target: [gemTags.patch_version_id, gemTags.key],
      set: { translation: sql`excluded.translation` },
    });

  info("gem_tags: upserted", { count: rows.length });
  return rows.length;
}
