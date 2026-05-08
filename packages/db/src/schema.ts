import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";

// Every domain row carries a patch_version_id. This lets us refresh data for a
// new PoE2 patch (0.4 → 0.5) by ingesting under a new patch_version_id while
// the old one keeps serving traffic, then atomically flipping is_current.
export const patchVersions = pgTable(
  "patch_versions",
  {
    id: serial("id").primaryKey(),
    tag: varchar("tag", { length: 16 }).notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    released_at: timestamp("released_at", { withTimezone: true }),
    is_current: boolean("is_current").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patch_versions_tag_unique").on(t.tag),
    uniqueIndex("patch_versions_only_one_current")
      .on(t.is_current)
      .where(sql`is_current = true`),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    gem_type: varchar("gem_type", { length: 32 }).notNull(),
    tags: text("tags").array().notNull().default([]),
    // damage_effectiveness from RePoE-Fork — used to seed ailment damage from
    // the source hit. Conflating this across gems is the #1 source of DoT drift.
    damage_effectiveness: numeric("damage_effectiveness", { precision: 6, scale: 3 }),
    base_stats: jsonb("base_stats").notNull().default({}),
  },
  (t) => [
    uniqueIndex("skills_patch_name_unique").on(t.patch_version_id, t.name),
    index("skills_patch_idx").on(t.patch_version_id),
  ],
);

export const passives = pgTable(
  "passives",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    // GGG's node_id from skilltree-export — stable across patches when a node
    // doesn't change, but we still scope by patch_version_id since stats can.
    node_id: varchar("node_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    stats: text("stats").array().notNull().default([]),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
  },
  (t) => [
    uniqueIndex("passives_patch_node_unique").on(t.patch_version_id, t.node_id),
    index("passives_patch_idx").on(t.patch_version_id),
  ],
);

export const mods = pgTable(
  "mods",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    mod_id: varchar("mod_id", { length: 96 }).notNull(),
    name: varchar("name", { length: 128 }),
    stats: text("stats").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    domain: varchar("domain", { length: 32 }).notNull(),
    generation_type: varchar("generation_type", { length: 32 }).notNull(),
  },
  (t) => [
    uniqueIndex("mods_patch_modid_unique").on(t.patch_version_id, t.mod_id),
    index("mods_patch_idx").on(t.patch_version_id),
  ],
);

export const baseItems = pgTable(
  "base_items",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    item_class: varchar("item_class", { length: 64 }).notNull(),
    implicit_mods: text("implicit_mods").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    requirements: jsonb("requirements").notNull().default({}),
  },
  (t) => [
    uniqueIndex("base_items_patch_name_unique").on(t.patch_version_id, t.name),
    index("base_items_patch_idx").on(t.patch_version_id),
  ],
);

export const uniqueItems = pgTable(
  "unique_items",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    base_item_id: integer("base_item_id").references(() => baseItems.id, {
      onDelete: "set null",
    }),
    stats: text("stats").array().notNull().default([]),
  },
  (t) => [
    uniqueIndex("unique_items_patch_name_unique").on(t.patch_version_id, t.name),
    index("unique_items_patch_idx").on(t.patch_version_id),
  ],
);

export const builds = pgTable(
  "builds",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    character_class: varchar("character_class", { length: 64 }).notNull(),
    ascendancy: varchar("ascendancy", { length: 64 }),
    pob_code: text("pob_code").notNull(),
    description: text("description"),
    archetype: varchar("archetype", { length: 32 }).notNull(),
    confidence_tier: varchar("confidence_tier", { length: 16 }).notNull(),
    tags: text("tags").array().notNull().default([]),
    is_published: boolean("is_published").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("builds_patch_idx").on(t.patch_version_id),
    index("builds_class_idx").on(t.character_class),
    index("builds_archetype_idx").on(t.archetype),
    index("builds_published_idx").on(t.is_published),
  ],
);

export const buildSkills = pgTable(
  "build_skills",
  {
    id: serial("id").primaryKey(),
    build_id: integer("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    skill_id: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 16 }).notNull(),
    // Support gems and link layout — engine reads supports[].support_id and
    // links count to compute final damage modifiers.
    supports: jsonb("supports").notNull().default([]),
  },
  (t) => [
    index("build_skills_build_idx").on(t.build_id),
    index("build_skills_role_idx").on(t.role),
  ],
);

export const buildPassives = pgTable(
  "build_passives",
  {
    id: serial("id").primaryKey(),
    build_id: integer("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    passive_id: integer("passive_id")
      .notNull()
      .references(() => passives.id, { onDelete: "restrict" }),
    // Only "key" nodes are stored — keystones, notables, ascendancy nodes.
    // Small-stat nodes are reconstructed from the PoB code at render time.
    is_keystone: boolean("is_keystone").notNull().default(false),
  },
  (t) => [
    uniqueIndex("build_passives_unique").on(t.build_id, t.passive_id),
    index("build_passives_build_idx").on(t.build_id),
  ],
);

export const buildItems = pgTable(
  "build_items",
  {
    id: serial("id").primaryKey(),
    build_id: integer("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    slot: varchar("slot", { length: 32 }).notNull(),
    unique_item_id: integer("unique_item_id").references(() => uniqueItems.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("build_items_slot_unique").on(t.build_id, t.slot),
    index("build_items_build_idx").on(t.build_id),
  ],
);

// Computed numbers cached per build. computed_at lets us re-run the engine
// when its rules change and identify stale rows; pob_boss_dps is the manually
// recorded ground-truth value from PoB desktop for the fixture validation suite.
export const buildStats = pgTable(
  "build_stats",
  {
    id: serial("id").primaryKey(),
    build_id: integer("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    boss_dps: numeric("boss_dps", { precision: 14, scale: 2 }).notNull(),
    clear_dps: numeric("clear_dps", { precision: 14, scale: 2 }).notNull(),
    ehp: numeric("ehp", { precision: 12, scale: 2 }).notNull(),
    life: integer("life").notNull(),
    es: integer("es").notNull(),
    armour: integer("armour").notNull(),
    evasion: integer("evasion").notNull(),
    resistances: jsonb("resistances").notNull(),
    confidence_tier: varchar("confidence_tier", { length: 16 }).notNull(),
    assumptions: jsonb("assumptions").notNull(),
    pob_boss_dps: numeric("pob_boss_dps", { precision: 14, scale: 2 }),
    computed_at: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("build_stats_build_unique").on(t.build_id)],
);

export const metaSnapshots = pgTable(
  "meta_snapshots",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 64 }).notNull(),
    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").notNull(),
  },
  (t) => [
    index("meta_snapshots_patch_source_idx").on(t.patch_version_id, t.source),
    index("meta_snapshots_fetched_idx").on(t.fetched_at),
  ],
);

export const itemPrices = pgTable(
  "item_prices",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    item_name: varchar("item_name", { length: 128 }).notNull(),
    chaos_value: numeric("chaos_value", { precision: 12, scale: 2 }),
    divine_value: numeric("divine_value", { precision: 12, scale: 4 }),
    fetched_at: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_prices_patch_name_idx").on(t.patch_version_id, t.item_name),
    index("item_prices_fetched_idx").on(t.fetched_at),
  ],
);
