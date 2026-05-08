import { db, ascendancies as ascendanciesTable, characterClasses } from "@poe2/db";
import { and, eq, sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info, warn } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// ascendancies.min.json: dict keyed by "<ClassName><Number>" (e.g., "Druid1",
// "Witch3b"). 37 entries cover both PoE1 and PoE2 classes. We store every
// entry; UI/engine filters to the 16 PoE2-active ascendancies by name when
// rendering, since "PoE2-active" isn't a property RePoE-Fork exposes.
//
// FK strategy: parse class name from the key prefix and resolve via
// character_classes.name. Two PoE1+PoE2 names (Witch, Ranger) point to a
// single character_classes row that's reused in both games — that's the
// expected behaviour, not a bug.
interface RepoeAscendancy {
  name: string;
  class_number?: number;
  flavour_text?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

function parseClassName(key: string): string {
  // "Druid1" → "Druid"; "Witch3b" → "Witch"
  const match = key.match(/^([A-Za-z]+?)\d+/);
  return match?.[1] ?? key;
}

export async function ingestAscendancies(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeAscendancy>>(
    repoeUrl("ascendancies.min.json"),
  );

  // Pre-fetch class name → id map to avoid an N+1 lookup.
  const classes = await db
    .select({ id: characterClasses.id, name: characterClasses.name })
    .from(characterClasses)
    .where(eq(characterClasses.patch_version_id, patchVersionId));
  const nameToId = new Map(classes.map((c) => [c.name, c.id]));

  let unmatched = 0;
  const rows = Object.entries(data).map(([key, asc]) => {
    const className = parseClassName(key);
    const cid = nameToId.get(className);
    if (!cid) {
      unmatched++;
      warn("ascendancy with no matching character_class", {
        key,
        className,
        ascendancy: asc.name,
      });
    }
    return {
      patch_version_id: patchVersionId,
      metadata_id: key,
      name: asc.name,
      character_class_id: cid ?? null,
      raw: asc as unknown as Record<string, unknown>,
    };
  });

  await db
    .insert(ascendanciesTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [ascendanciesTable.patch_version_id, ascendanciesTable.metadata_id],
      set: {
        name: sql`excluded.name`,
        character_class_id: sql`excluded.character_class_id`,
        raw: sql`excluded.raw`,
      },
    });

  info("ascendancies: upserted", { count: rows.length, unmatched });
  return rows.length;
}
