import { db, skills } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// skills.min.json holds 7500+ entries — most are monster/boss/environment
// abilities the player can never cast. We filter to entries whose metadata_id
// contains "Player" (covers ~1300 entries: player active skills + the 634
// support gems that share the suffix). The 5 supports without "Player" in
// their key are accepted casualties.
//
// Active skills have `active_skill.display_name` we surface as `name`.
// Support gems don't carry their own display name in this file (it lives in
// skill_gems.json); we fall back to metadata_id with common suffixes stripped
// so they aren't unreadable.
interface RepoeActiveSkill {
  id?: string;
  display_name?: string;
  description?: string;
  types?: string[];
  weapon_restrictions?: string[];
  is_skill_totem?: boolean;
  is_manually_casted?: boolean;
}

interface RepoeSupportGem {
  allowed_types?: string[];
  letter?: string;
  supports_gems_only?: boolean;
}

interface RepoeSkill {
  is_support?: boolean;
  cast_time?: number;
  active_skill?: RepoeActiveSkill | null;
  support_gem?: RepoeSupportGem | null;
  per_level?: Record<string, unknown>;
  static?: Record<string, unknown>;
  stat_sets?: unknown[];
  stats?: Record<string, unknown>;
  [key: string]: unknown;
}

function extractSpiritCost(skill: RepoeSkill): number | null {
  const reservations = (skill.static as Record<string, unknown> | undefined)
    ?.reservations as Record<string, unknown> | undefined;
  const spirit = reservations?.spirit;
  if (typeof spirit === "number") return spirit;
  if (typeof spirit === "string") {
    const n = parseInt(spirit, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

function deriveName(metadataId: string, skill: RepoeSkill): string {
  const display = skill.active_skill?.display_name;
  if (display) return display;
  // Strip well-known suffixes for support gems and uncommon entries.
  return metadataId
    .replace(/SupportPlayer$/, "")
    .replace(/Support$/, "")
    .replace(/Player$/, "");
}

export async function ingestSkills(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeSkill>>(
    repoeUrl("skills.min.json"),
  );

  const filtered: Array<[string, RepoeSkill]> = [];
  let skipped = 0;
  for (const [metadataId, skill] of Object.entries(data)) {
    if (!metadataId.includes("Player")) {
      skipped++;
      continue;
    }
    filtered.push([metadataId, skill]);
  }

  const rows = filtered.map(([metadataId, skill]) => ({
    patch_version_id: patchVersionId,
    metadata_id: metadataId,
    name: deriveName(metadataId, skill),
    gem_type: skill.is_support ? "support" : "active",
    tags: skill.active_skill?.types ?? [],
    damage_effectiveness: null,
    // Spirit cost lives at static.reservations.spirit for persistent skills.
    spirit_cost: extractSpiritCost(skill),
    base_stats: (skill.static ?? {}) as Record<string, unknown>,
    release_state: null,
    raw: skill as unknown as Record<string, unknown>,
  }));

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(skills)
      .values(slice)
      .onConflictDoUpdate({
        target: [skills.patch_version_id, skills.metadata_id],
        set: {
          name: sql`excluded.name`,
          gem_type: sql`excluded.gem_type`,
          tags: sql`excluded.tags`,
          spirit_cost: sql`excluded.spirit_cost`,
          base_stats: sql`excluded.base_stats`,
          raw: sql`excluded.raw`,
        },
      });
  }

  info("skills: upserted", { count: rows.length, skipped });
  return rows.length;
}
