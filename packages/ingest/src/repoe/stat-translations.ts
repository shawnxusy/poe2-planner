import { db, statTranslations } from "@poe2/db";
import { eq } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// stat_translations/<file>.min.json files are arrays of:
//   { ids: string[], English: [{ string, format, condition, index_handlers }] }
// One stat_id can appear in multiple files (e.g., a passive node and a gem
// might both reference "additional_strength"). We ingest every entry from
// every relevant source and let consumers pick the most specific match.
//
// We start with the four sources covering the build calculator's needs:
//   - stat_descriptions: catch-all (item mods, ailments, defenses)
//   - passive_skill_stat_descriptions: passive tree
//   - skill_stat_descriptions: skill gems and supports
//   - gem_stat_descriptions: gem-level scaling text
// League-specific files (atlas, sanctum, heist…) are deferred.
const SOURCES = [
  "stat_translations/stat_descriptions.min.json",
  "stat_translations/passive_skill_stat_descriptions.min.json",
  "stat_translations/skill_stat_descriptions.min.json",
  "stat_translations/gem_stat_descriptions.min.json",
];

interface RepoeTranslationVariant {
  string?: string;
  format?: string[];
  condition?: unknown[];
  index_handlers?: unknown[];
}

interface RepoeTranslation {
  ids: string[];
  English?: RepoeTranslationVariant[];
  [key: string]: unknown;
}

export async function ingestStatTranslations(
  patchVersionId: number,
): Promise<number> {
  const entries: Array<{ source: string; t: RepoeTranslation }> = [];
  for (const path of SOURCES) {
    const data = await fetchJsonCached<RepoeTranslation[]>(repoeUrl(path));
    for (const t of data) entries.push({ source: path, t });
  }

  // Delete-and-reinsert: simpler than upsert when there's no natural
  // single-column key (stat_ids is an array). Safe because no FKs target
  // this table.
  await db.delete(statTranslations).where(eq(statTranslations.patch_version_id, patchVersionId));

  const rows = entries.map(({ source, t }) => ({
    patch_version_id: patchVersionId,
    stat_ids: t.ids,
    template: t.English?.[0]?.string ?? "",
    raw: { source, ...t } as unknown as Record<string, unknown>,
  }));

  // Skip rows with no English template — they exist (a few entries) but are
  // un-renderable and would hide upstream issues if we silently kept them.
  const usable = rows.filter((r) => r.template.length > 0);
  const dropped = rows.length - usable.length;

  const CHUNK = 2000;
  for (let i = 0; i < usable.length; i += CHUNK) {
    const slice = usable.slice(i, i + CHUNK);
    await db.insert(statTranslations).values(slice);
  }

  info("stat_translations: inserted", { count: usable.length, dropped });
  return usable.length;
}
