import { db, patchVersions } from "@poe2/db";
import { eq } from "drizzle-orm";

// Resolves the currently-active patch row. All ingest writes target this
// patch_version_id. To roll over to a new patch, insert a new patch_versions
// row and flip is_current; this function will then return that one.
export async function currentPatchVersionId(): Promise<number> {
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
  return row.id;
}
