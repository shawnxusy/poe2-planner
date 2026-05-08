import { db, mods } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// mods.min.json is a dict keyed by mod metadata_id (e.g., "Strength1"). Each
// mod has nested `stats` objects (id + min/max). We flatten stat IDs into
// the indexed `stats text[]` column for fast "what mods grant X" lookups; the
// per-roll min/max lives in `raw` for the engine to read when computing damage.
//
// We keep ALL domains (item, monster, area, …) — engine + UI may filter at
// query time. 14k+ rows is small enough that storing everything stays cheap.
interface RepoeStat {
  id: string;
  min: number;
  max: number;
}

interface RepoeMod {
  name?: string;
  domain?: string;
  generation_type?: string;
  stats?: RepoeStat[];
  implicit_tags?: string[];
  adds_tags?: string[];
  text?: string;
  type?: string;
  is_essence_only?: boolean;
  required_level?: number;
  [key: string]: unknown;
}

export async function ingestMods(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeMod>>(
    repoeUrl("mods.min.json"),
  );

  const rows = Object.entries(data).map(([metadataId, mod]) => ({
    patch_version_id: patchVersionId,
    metadata_id: metadataId,
    name: mod.name ?? null,
    stats: (mod.stats ?? []).map((s) => s.id),
    tags: mod.implicit_tags ?? [],
    domain: mod.domain ?? null,
    generation_type: mod.generation_type ?? null,
    release_state: null,
    raw: mod as unknown as Record<string, unknown>,
  }));

  // 14k rows × ~9 fields = ~126k params per insert. Postgres caps params at
  // ~65k, so we chunk. 5000-row chunks land ~45k params each.
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(mods)
      .values(slice)
      .onConflictDoUpdate({
        target: [mods.patch_version_id, mods.metadata_id],
        set: {
          name: sql`excluded.name`,
          stats: sql`excluded.stats`,
          tags: sql`excluded.tags`,
          domain: sql`excluded.domain`,
          generation_type: sql`excluded.generation_type`,
          raw: sql`excluded.raw`,
        },
      });
  }

  info("mods: upserted", { count: rows.length });
  return rows.length;
}
