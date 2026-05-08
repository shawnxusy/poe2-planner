import { db, characterClasses } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// RePoE-Fork's characters.min.json is a list. Each entry has metadata_id
// (path-style), display name, integer_id, and base_stats. Note: the PoE2
// dataset includes both PoE1 and PoE2 entries — PoE2-specific classes have
// a "Fourb" suffix in metadata_id (StrFourb=Warrior, IntFourb=Sorceress,
// etc.), while "Four" (no b) entries are PoE1 (Marauder, Witch, Ranger…).
// We store everything; consumers filter by metadata_id pattern when needed.
interface RepoeCharacter {
  metadata_id: string;
  name: string;
  integer_id?: number;
  description?: string;
  base_stats?: Record<string, unknown>;
}

export async function ingestCharacters(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<RepoeCharacter[]>(
    repoeUrl("characters.min.json"),
  );

  const rows = data.map((c) => ({
    patch_version_id: patchVersionId,
    metadata_id: c.metadata_id,
    name: c.name,
    description: c.description ?? null,
    base_stats: (c.base_stats ?? {}) as Record<string, unknown>,
    raw: c as unknown as Record<string, unknown>,
  }));

  await db
    .insert(characterClasses)
    .values(rows)
    .onConflictDoUpdate({
      target: [characterClasses.patch_version_id, characterClasses.metadata_id],
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        base_stats: sql`excluded.base_stats`,
        raw: sql`excluded.raw`,
      },
    });

  info("characters: upserted", { count: rows.length });
  return rows.length;
}
