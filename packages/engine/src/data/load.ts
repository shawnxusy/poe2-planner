// Bulk-load the patch data the engine needs into the GameData snapshot.
// Designed to be called once per process per patch_version; the resulting
// snapshot is reusable across many calculate() calls.

import {
  db,
  mods as modsTable,
  passives as passivesTable,
  patchVersions,
  skills as skillsTable,
} from "@poe2/db";
import { eq } from "drizzle-orm";
import type {
  GameData,
  ModRecord,
  PassiveRecord,
  SkillRecord,
} from "./types.js";

export async function loadGameData(opts?: {
  patch_tag?: string;
}): Promise<GameData> {
  const patch = await resolvePatch(opts?.patch_tag);

  const [passiveRows, skillRows, modRows] = await Promise.all([
    db.select().from(passivesTable).where(eq(passivesTable.patch_version_id, patch.id)),
    db.select().from(skillsTable).where(eq(skillsTable.patch_version_id, patch.id)),
    db.select().from(modsTable).where(eq(modsTable.patch_version_id, patch.id)),
  ]);

  const passives_by_hash = new Map<number, PassiveRecord>();
  const passives_by_id = new Map<string, PassiveRecord>();
  for (const row of passiveRows) {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const hashRaw = raw["hash"];
    const hash = typeof hashRaw === "number" ? hashRaw : Number.parseInt(String(hashRaw ?? ""), 10);
    if (!Number.isFinite(hash)) continue;
    const stats_values = (raw["stats"] && typeof raw["stats"] === "object")
      ? (raw["stats"] as Record<string, number>)
      : {};
    const rec: PassiveRecord = {
      hash,
      id: row.node_id,
      name: row.name,
      type: row.type,
      stat_ids: row.stats ?? [],
      stats_values,
      is_keystone: row.type === "keystone",
      is_notable: row.type === "notable",
    };
    passives_by_hash.set(hash, rec);
    passives_by_id.set(rec.id, rec);
  }

  const skills_by_metadata_id = new Map<string, SkillRecord>();
  for (const row of skillRows) {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const rec: SkillRecord = {
      metadata_id: row.metadata_id,
      name: row.name,
      gem_type: row.gem_type ?? "active",
      tags: row.tags ?? [],
      per_level: (raw["per_level"] as SkillRecord["per_level"]) ?? undefined,
      static: (raw["static"] as Record<string, number>) ?? undefined,
    };
    skills_by_metadata_id.set(row.metadata_id, rec);
  }

  const mods_by_metadata_id = new Map<string, ModRecord>();
  for (const row of modRows) {
    const raw = (row.raw ?? {}) as { stats?: Array<{ id: string; min: number; max: number }> };
    mods_by_metadata_id.set(row.metadata_id, {
      metadata_id: row.metadata_id,
      name: row.name,
      stats: raw.stats ?? [],
      tags: row.tags ?? [],
      domain: row.domain,
      generation_type: row.generation_type,
    });
  }

  return {
    patch_version_id: patch.id,
    patch_tag: patch.tag,
    passives_by_hash,
    passives_by_id,
    skills_by_metadata_id,
    mods_by_metadata_id,
  };
}

async function resolvePatch(tag?: string): Promise<{ id: number; tag: string }> {
  if (tag) {
    const rows = await db
      .select({ id: patchVersions.id, tag: patchVersions.tag })
      .from(patchVersions)
      .where(eq(patchVersions.tag, tag))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error(`loadGameData: patch_versions row with tag=${tag} not found`);
    return row;
  }
  const rows = await db
    .select({ id: patchVersions.id, tag: patchVersions.tag })
    .from(patchVersions)
    .where(eq(patchVersions.is_current, true))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("loadGameData: no patch_versions row marked is_current");
  }
  return row;
}
