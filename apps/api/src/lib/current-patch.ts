import { db, patchVersions } from "@poe2/db";
import { eq } from "drizzle-orm";

let cached: number | null = null;

export async function currentPatchVersionId(): Promise<number> {
  if (cached !== null) return cached;
  const rows = await db
    .select({ id: patchVersions.id })
    .from(patchVersions)
    .where(eq(patchVersions.is_current, true))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(
      "No current patch_versions row found — run packages/db/scripts/seed-patch.ts first",
    );
  }
  cached = row.id;
  return cached;
}
