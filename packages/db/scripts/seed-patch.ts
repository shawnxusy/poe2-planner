import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const { db } = await import("../src/client.js");
const { patchVersions } = await import("../src/schema.js");

const inserted = await db
  .insert(patchVersions)
  .values({
    tag: "0.4",
    label: "Fate of the Vaal",
    released_at: new Date("2026-02-01T00:00:00Z"),
    is_current: true,
  })
  .onConflictDoNothing({ target: patchVersions.tag })
  .returning();

console.log("Inserted:", inserted);

const all = await db.select().from(patchVersions);
console.log("All patch_versions:");
for (const p of all) console.log(" ", p);

process.exit(0);
