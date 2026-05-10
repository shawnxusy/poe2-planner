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
    // Display tag visible to users — e.g., "0.4", "0.5".
    tag: varchar("tag", { length: 16 }).notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    // GGG's internal client version exposed by RePoE-Fork — e.g., "4.4.0.11.2".
    // We track this so the ingest can decide whether refetched data is newer
    // than what we already have.
    internal_version: varchar("internal_version", { length: 32 }),
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

export const characterClasses = pgTable(
  "character_classes",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    description: text("description"),
    base_stats: jsonb("base_stats").notNull().default({}),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("character_classes_patch_metadata_unique").on(
      t.patch_version_id,
      t.metadata_id,
    ),
    index("character_classes_patch_idx").on(t.patch_version_id),
  ],
);

export const ascendancies = pgTable(
  "ascendancies",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    // Ascendancy display name (e.g., "Stormweaver", "Titan"). Pulled from
    // RePoE-Fork or post-processed by the ingest if the source omits it.
    name: varchar("name", { length: 64 }).notNull(),
    character_class_id: integer("character_class_id").references(
      () => characterClasses.id,
      { onDelete: "set null" },
    ),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("ascendancies_patch_metadata_unique").on(
      t.patch_version_id,
      t.metadata_id,
    ),
    index("ascendancies_patch_idx").on(t.patch_version_id),
    index("ascendancies_class_idx").on(t.character_class_id),
  ],
);

export const itemClasses = pgTable(
  "item_classes",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    // RePoE keys this by short string like "TwoHandSword", "Bow".
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    category: varchar("category", { length: 64 }),
    category_id: varchar("category_id", { length: 64 }),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("item_classes_patch_key_unique").on(t.patch_version_id, t.key),
  ],
);

export const tagsTable = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    // Tag string used across base_items, mods, etc. — e.g., "fire", "weapon".
    key: varchar("key", { length: 64 }).notNull(),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("tags_patch_key_unique").on(t.patch_version_id, t.key),
  ],
);

export const gemTags = pgTable(
  "gem_tags",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    // e.g., "[Fire]" — the bracketed translation. Null for internal-only tags
    // (strength, dexterity, intelligence, etc.) that don't surface in the UI.
    translation: varchar("translation", { length: 128 }),
  },
  (t) => [
    uniqueIndex("gem_tags_patch_key_unique").on(t.patch_version_id, t.key),
  ],
);

// Maps a list of stat_ids + values to human-readable text. RePoE's
// stat_translations.json is the source. Each row's stat_ids array can be
// 1–N entries (some translations need multiple stats to combine, e.g.
// "+X to Y elemental resistances" needs three stat_ids).
export const statTranslations = pgTable(
  "stat_translations",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    stat_ids: text("stat_ids").array().notNull(),
    // English template with {0}, {1} placeholders; renderer substitutes values.
    template: text("template").notNull(),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    index("stat_translations_patch_idx").on(t.patch_version_id),
    index("stat_translations_stat_ids_gin").using("gin", t.stat_ids),
  ],
);

// === Game data tables (ingested from RePoE-Fork) ===

export const skills = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    gem_type: varchar("gem_type", { length: 32 }),
    tags: text("tags").array().notNull().default([]),
    // damage_effectiveness from RePoE-Fork — used to seed ailment damage from
    // the source hit. Conflating this across gems is the #1 source of DoT drift.
    damage_effectiveness: numeric("damage_effectiveness", { precision: 6, scale: 3 }),
    // Spirit reserved when the skill is active (auras, heralds, persistent buffs).
    // Null for skills that do not cost Spirit.  Source: raw->'static'->'reservations'->>'spirit'.
    spirit_cost: integer("spirit_cost"),
    base_stats: jsonb("base_stats").notNull().default({}),
    release_state: varchar("release_state", { length: 32 }),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("skills_patch_metadata_unique").on(t.patch_version_id, t.metadata_id),
    index("skills_patch_idx").on(t.patch_version_id),
    index("skills_name_idx").on(t.name),
    index("skills_release_idx").on(t.release_state),
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
    // Neighbour skill IDs from tree.lua connections[]. Populated by
    // pob/tree-nodes ingest; null until that step runs.
    connections: integer("connections").array(),
    raw: jsonb("raw").notNull().default({}),
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
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }),
    stats: text("stats").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    domain: varchar("domain", { length: 32 }),
    generation_type: varchar("generation_type", { length: 32 }),
    release_state: varchar("release_state", { length: 32 }),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("mods_patch_metadata_unique").on(t.patch_version_id, t.metadata_id),
    index("mods_patch_idx").on(t.patch_version_id),
    index("mods_domain_idx").on(t.domain),
    index("mods_generation_idx").on(t.generation_type),
  ],
);

export const baseItems = pgTable(
  "base_items",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    item_class: varchar("item_class", { length: 64 }).notNull(),
    domain: varchar("domain", { length: 32 }),
    drop_level: integer("drop_level"),
    inherits_from: varchar("inherits_from", { length: 256 }),
    implicit_mods: text("implicit_mods").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    properties: jsonb("properties").notNull().default({}),
    visual_identity: jsonb("visual_identity").notNull().default({}),
    release_state: varchar("release_state", { length: 32 }),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("base_items_patch_metadata_unique").on(
      t.patch_version_id,
      t.metadata_id,
    ),
    index("base_items_patch_idx").on(t.patch_version_id),
    index("base_items_class_idx").on(t.item_class),
    index("base_items_release_idx").on(t.release_state),
  ],
);

export const uniqueItems = pgTable(
  "unique_items",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    metadata_id: varchar("metadata_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    base_item_id: integer("base_item_id").references(() => baseItems.id, {
      onDelete: "set null",
    }),
    stats: text("stats").array().notNull().default([]),
    release_state: varchar("release_state", { length: 32 }),
    raw: jsonb("raw").notNull().default({}),
  },
  (t) => [
    uniqueIndex("unique_items_patch_metadata_unique").on(
      t.patch_version_id,
      t.metadata_id,
    ),
    index("unique_items_patch_idx").on(t.patch_version_id),
    index("unique_items_name_idx").on(t.name),
  ],
);

// Charm items that auto-trigger based on conditions (replaced utility flasks).
// Up to 3 slots: 1 from belt implicit, 1 from quest reward, 1 from some uniques.
// Seeded statically in packages/ingest/src/data/charms-seed.ts (not from RePoE).
export const charms = pgTable(
  "charms",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    // 'ailment_immunity' | 'buff' | 'utility'
    charm_type: varchar("charm_type", { length: 32 }).notNull(),
    // Condition that triggers the charm, e.g. "when you are Shocked"
    trigger_condition: text("trigger_condition"),
    effect: text("effect").notNull(),
    effect_duration_ms: integer("effect_duration_ms"),
    charges_max: integer("charges_max"),
    charges_per_use: integer("charges_per_use"),
  },
  (t) => [
    uniqueIndex("charms_patch_name_unique").on(t.patch_version_id, t.name),
    index("charms_patch_idx").on(t.patch_version_id),
    index("charms_type_idx").on(t.charm_type),
  ],
);

// Augments (formerly Runes) — socketed into weapons and armour for bonus stats.
// Caster weapons (wands, staves) and jewellery have 0 sockets.
// Soul Cores (drop only from Trials of Chaos) are a separate mechanic — they
// affect trials, not item sockets; handled via system-prompt knowledge.
export const augments = pgTable(
  "augments",
  {
    id: serial("id").primaryKey(),
    patch_version_id: integer("patch_version_id")
      .notNull()
      .references(() => patchVersions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    // Item types that accept this augment: 'weapon', 'armour', 'shield', 'quiver'
    slot_types: text("slot_types").array().notNull().default([]),
    effect: text("effect").notNull(),
    tier: integer("tier"),
  },
  (t) => [
    uniqueIndex("augments_patch_name_unique").on(t.patch_version_id, t.name),
    index("augments_patch_idx").on(t.patch_version_id),
  ],
);

// === Build catalog (user-curated content) ===

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

// === External snapshots (poe.ninja, prices, meta) ===

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
