import { db, skills } from "@poe2/db";
import { eq } from "drizzle-orm";

async function main() {
  const sid = process.argv[2] ?? "IceStrikePlayer";
  const rows = await db.select().from(skills).where(eq(skills.metadata_id, sid)).limit(1);
  const row = rows[0];
  if (!row) {
    console.log("not found");
    return;
  }
  console.log("=== Skill row ===");
  console.log(`metadata_id: ${row.metadata_id}`);
  console.log(`name: ${row.name}`);
  console.log(`tags: ${(row.tags ?? []).join(", ")}`);
  console.log();
  console.log("=== Raw JSON keys ===");
  const raw = row.raw as Record<string, unknown>;
  console.log(Object.keys(raw).join(", "));
  console.log();
  console.log("=== static ===");
  console.log(JSON.stringify(raw.static, null, 2));
  console.log();
  console.log("=== per_level['21'] ===");
  console.log(JSON.stringify((raw.per_level as Record<string, unknown>)?.["21"], null, 2));
  console.log();
  console.log("=== description / display_name / etc ===");
  for (const k of ["display_name", "description", "active_skill", "stat_translation_file", "skill_levels"]) {
    if (k in raw) console.log(`${k}: ${JSON.stringify(raw[k]).slice(0, 200)}`);
  }
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
