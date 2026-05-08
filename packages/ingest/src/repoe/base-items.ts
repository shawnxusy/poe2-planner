import { db, baseItems } from "@poe2/db";
import { sql } from "drizzle-orm";
import { fetchJsonCached } from "../lib/fetch-cache.js";
import { info } from "../lib/log.js";
import { repoeUrl } from "./source.js";

// Equipment item_class keys used by base_items. Sourced from item_classes
// rows whose category_id matches a known equipment category. Hardcoded here
// rather than queried so the ingestor stays correct even if item_classes
// hasn't been refreshed yet for this run.
const EQUIPMENT_ITEM_CLASSES = new Set([
  // Weapons
  "One Hand Axe", "Two Hand Axe",
  "One Hand Mace", "Two Hand Mace",
  "One Hand Sword", "Two Hand Sword",
  "Bow", "Claw", "Crossbow", "Dagger",
  "Flail", "Spear", "Staff", "Wand", "Sceptre", "Warstaff",
  // Off-hand
  "Buckler", "Shield", "Focus", "Quiver",
  // Armour
  "Body Armour", "Helmet", "Gloves", "Boots",
  // Accessories
  "Amulet", "Belt", "Ring",
  // Flasks / charms
  "LifeFlask", "ManaFlask", "UtilityFlask",
  // Jewels
  "Jewel", "AbyssJewel",
  // Trinkets / talismans
  "Trinket", "Talisman",
]);

// Keep released items + bases that exist only as the foundation of a unique
// item (e.g., Tabula Rasa's "Simple Robe" base). Skip legacy/unreleased.
const KEEP_RELEASE_STATES = new Set(["released", "unique_only"]);

interface RepoeBaseItem {
  name: string;
  item_class: string;
  domain?: string;
  drop_level?: number;
  inherits_from?: string;
  implicits?: string[];
  tags?: string[];
  properties?: Record<string, unknown>;
  visual_identity?: Record<string, unknown>;
  release_state?: string;
  [key: string]: unknown;
}

export async function ingestBaseItems(patchVersionId: number): Promise<number> {
  const data = await fetchJsonCached<Record<string, RepoeBaseItem>>(
    repoeUrl("base_items.min.json"),
  );

  const filtered: Array<[string, RepoeBaseItem]> = [];
  let skipped = 0;
  for (const [metadataId, item] of Object.entries(data)) {
    if (!EQUIPMENT_ITEM_CLASSES.has(item.item_class)) {
      skipped++;
      continue;
    }
    if (item.release_state && !KEEP_RELEASE_STATES.has(item.release_state)) {
      skipped++;
      continue;
    }
    filtered.push([metadataId, item]);
  }

  const rows = filtered.map(([metadataId, item]) => ({
    patch_version_id: patchVersionId,
    metadata_id: metadataId,
    name: item.name,
    item_class: item.item_class,
    domain: item.domain ?? null,
    drop_level: item.drop_level ?? null,
    inherits_from: item.inherits_from ?? null,
    implicit_mods: item.implicits ?? [],
    tags: item.tags ?? [],
    properties: (item.properties ?? {}) as Record<string, unknown>,
    visual_identity: (item.visual_identity ?? {}) as Record<string, unknown>,
    release_state: item.release_state ?? null,
    raw: item as unknown as Record<string, unknown>,
  }));

  // Postgres caps insert parameters at ~65k. Each row has ~13 fields, so a
  // 2000-row chunk uses ~26k params — safe margin.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db
      .insert(baseItems)
      .values(slice)
      .onConflictDoUpdate({
        target: [baseItems.patch_version_id, baseItems.metadata_id],
        set: {
          name: sql`excluded.name`,
          item_class: sql`excluded.item_class`,
          domain: sql`excluded.domain`,
          drop_level: sql`excluded.drop_level`,
          inherits_from: sql`excluded.inherits_from`,
          implicit_mods: sql`excluded.implicit_mods`,
          tags: sql`excluded.tags`,
          properties: sql`excluded.properties`,
          visual_identity: sql`excluded.visual_identity`,
          release_state: sql`excluded.release_state`,
          raw: sql`excluded.raw`,
        },
      });
  }

  info("base_items: upserted", { count: rows.length, skipped });
  return rows.length;
}
