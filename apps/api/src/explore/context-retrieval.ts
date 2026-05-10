// Seed-based context retrieval for AI build exploration.
//
// Given a free-text seed ("plant skills", "Voltaxic Rift", "chaos and shock"),
// pulls relevant passives, skills, and unique items from the DB to form the
// factual grounding for Claude's build exploration prompt.
//
// Design notes:
//   - Ascendancy nodes (type ascendancy_notable/keystone) have human-readable
//     stat strings (from PoB tree.lua ingest) — searched by name + stats text.
//   - Normal tree notables have opaque stat IDs — searched by name only; stat
//     IDs are omitted from the context since they add noise not signal.
//   - Skills are searched by name and tags array.
//   - Unique items are searched by name and stats text (PoB-enriched mod text).
//   - If the seed is an exact unique item name, that item is treated as the
//     "anchor" and its stats are added to the search token set so we find
//     passives/skills that synergize with its mechanics.

import { db, passives, skills, uniqueItems } from "@poe2/db";
import { and, eq, inArray, or, ilike, sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AscendancyNode {
  name: string;
  ascendancy: string;
  is_notable: boolean;
  stats: string[];
}

export interface TreeNotable {
  name: string;
  type: string; // "notable" | "keystone"
}

export interface SkillResult {
  name: string;
  gem_type: string;
  tags: string[];
}

export interface UniqueResult {
  name: string;
  stats: string[];
}

export interface SeedContext {
  seed: string;
  tokens: string[];
  anchor_unique: UniqueResult | null;
  ascendancy_nodes: AscendancyNode[];
  tree_notables: TreeNotable[];
  skills: SkillResult[];
  unique_items: UniqueResult[];
}

// ── Token extraction ───────────────────────────────────────────────────────

const STOPWORDS = new Set([
  // Common English
  "a", "an", "the", "and", "or", "of", "to", "in", "for", "on", "with",
  "as", "at", "by", "is", "it", "its", "can", "that", "this", "from",
  "my", "your", "i", "you", "we", "be", "are", "was", "has", "have",
  "also", "more", "less", "per", "all", "any", "not", "no",
  // PoE-generic terms that match too broadly when used alone
  "skill", "skills", "gem", "gems", "buff", "debuff",
  "level", "adds", "base", "gain", "take", "give", "use",
]);

function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function tokenize(seed: string): string[] {
  return seed
    .toLowerCase()
    .split(/[\s,;/()[\]]+/)
    .map((t) => t.replace(/[^a-z0-9'-]/g, "").trim())
    .filter((t) => {
      if (t.length < 3) return false;
      if (STOPWORDS.has(t)) return false;
      // Drop purely numeric or range tokens like "300-500", "10-15", "100"
      if (/^[\d'-]+$/.test(t)) return false;
      return true;
    });
}

function nameMatch(tokens: string[], nameCol: Parameters<typeof ilike>[0]) {
  return or(...tokens.map((t) => ilike(nameCol, `%${escapeLike(t)}%`)))!;
}

// ── Core retrieval ─────────────────────────────────────────────────────────

export async function retrieveSeedContext(
  seed: string,
  patchVersionId: number,
): Promise<SeedContext> {
  const tokens = tokenize(seed);

  // Step 1: exact-name lookup on uniques to find an anchor item.
  // An anchor is used to expand tokens with the item's stat keywords.
  const anchorUnique = await resolveAnchorUnique(seed, tokens, patchVersionId);
  const expandedTokens = anchorUnique
    ? expandTokensFromStats(tokens, anchorUnique.stats)
    : tokens;

  const effectiveTokens = expandedTokens.length > 0 ? expandedTokens : tokens;

  if (effectiveTokens.length === 0) {
    return {
      seed,
      tokens,
      anchor_unique: anchorUnique,
      ascendancy_nodes: [],
      tree_notables: [],
      skills: [],
      unique_items: anchorUnique ? [anchorUnique] : [],
    };
  }

  const [ascNodes, treeNotables, skillResults, uniqueResults] =
    await Promise.all([
      fetchAscendancyNodes(effectiveTokens, patchVersionId),
      fetchTreeNotables(effectiveTokens, patchVersionId),
      fetchSkills(effectiveTokens, patchVersionId),
      fetchUniques(effectiveTokens, patchVersionId, anchorUnique?.name),
    ]);

  return {
    seed,
    tokens: effectiveTokens,
    anchor_unique: anchorUnique,
    ascendancy_nodes: ascNodes,
    tree_notables: treeNotables,
    skills: skillResults,
    unique_items: uniqueResults,
  };
}

// ── Anchor unique ──────────────────────────────────────────────────────────

async function resolveAnchorUnique(
  seed: string,
  tokens: string[],
  patchVersionId: number,
): Promise<UniqueResult | null> {
  // Try exact name match first (case-insensitive), then fuzzy on tokens.
  const rows = await db
    .select({ name: uniqueItems.name, stats: uniqueItems.stats })
    .from(uniqueItems)
    .where(
      and(
        eq(uniqueItems.patch_version_id, patchVersionId),
        or(
          ilike(uniqueItems.name, escapeLike(seed)),
          tokens.length > 0
            ? and(
                ...tokens.map((t) =>
                  ilike(uniqueItems.name, `%${escapeLike(t)}%`),
                ),
              )
            : undefined,
        ),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.stats.length === 0) return null;
  return { name: row.name, stats: row.stats };
}

// Generic stat words that appear everywhere in PoE mod text and add no
// discrimination signal when expanding search from a unique item's stats.
const EXPANSION_BLOCKLIST = new Set([
  "damage", "attack", "speed", "increased", "decreased", "reduced",
  "maximum", "minimum", "additional", "converted", "resistance",
  "resistances", "rating", "quality", "rarity", "area", "effect",
  "duration", "radius", "critical", "strike", "chance", "multiplier",
  "recovered", "regenerated", "recharge", "regeneration", "recovery",
]);

// Pull keywords out of a unique item's mod text to expand the search.
// "Your Chaos Damage can Shock" → adds ["chaos", "shock"] if not already present.
function expandTokensFromStats(tokens: string[], stats: string[]): string[] {
  const combined = stats.join(" ").toLowerCase();
  const extra = tokenize(combined).filter(
    (t) => !tokens.includes(t) && !EXPANSION_BLOCKLIST.has(t),
  );
  // Cap expansion to avoid over-broadening: take up to 6 extra tokens
  const merged = [...new Set([...tokens, ...extra])];
  return merged.slice(0, tokens.length + 6);
}

// ── Table queries ──────────────────────────────────────────────────────────

async function fetchAscendancyNodes(
  tokens: string[],
  patchVersionId: number,
): Promise<AscendancyNode[]> {
  const rows = await db
    .select({
      name: passives.name,
      type: passives.type,
      stats: passives.stats,
      raw: passives.raw,
    })
    .from(passives)
    .where(
      and(
        eq(passives.patch_version_id, patchVersionId),
        inArray(passives.type, ["ascendancy_notable", "ascendancy_keystone"]),
        or(
          nameMatch(tokens, passives.name),
          ...tokens.map(
            (t) => sql`array_to_string(${passives.stats}, ' ') ILIKE ${"%" + escapeLike(t) + "%"}`,
          ),
        )!,
      ),
    )
    .limit(15);

  return rows.map((r) => ({
    name: r.name,
    ascendancy: (r.raw as Record<string, unknown>)?.ascendancy_name as string ?? "",
    is_notable: r.type === "ascendancy_notable",
    stats: r.stats,
  }));
}

async function fetchTreeNotables(
  tokens: string[],
  patchVersionId: number,
): Promise<TreeNotable[]> {
  const rows = await db
    .select({ name: passives.name, type: passives.type })
    .from(passives)
    .where(
      and(
        eq(passives.patch_version_id, patchVersionId),
        inArray(passives.type, ["notable", "keystone"]),
        // Name-only match: stat IDs are opaque and not useful for text search.
        nameMatch(tokens, passives.name),
      ),
    )
    .limit(12);

  return rows.map((r) => ({ name: r.name, type: r.type }));
}

async function fetchSkills(
  tokens: string[],
  patchVersionId: number,
): Promise<SkillResult[]> {
  const rows = await db
    .select({
      name: skills.name,
      gem_type: skills.gem_type,
      tags: skills.tags,
    })
    .from(skills)
    .where(
      and(
        eq(skills.patch_version_id, patchVersionId),
        // Exclude raw metadata IDs that slipped through ingest (no display_name):
        // real skill names have spaces or are short single words; raw IDs are
        // long CamelCase strings like "GTPlayerMonsterModVolatilePlants".
        sql`(${skills.name} ~ ' ' OR LENGTH(${skills.name}) <= 20)`,
        or(
          // Name match
          ...tokens.map((t) => ilike(skills.name, `%${escapeLike(t)}%`)),
          // Tag array contains any token
          ...tokens.map(
            (t) =>
              sql`EXISTS (SELECT 1 FROM unnest(${skills.tags}) tag WHERE tag ILIKE ${"%" + escapeLike(t) + "%"})`,
          ),
        )!,
      ),
    )
    .limit(20);

  return rows.map((r) => ({
    name: r.name,
    gem_type: r.gem_type ?? "active",
    tags: r.tags,
  }));
}

async function fetchUniques(
  tokens: string[],
  patchVersionId: number,
  excludeName?: string,
): Promise<UniqueResult[]> {
  const rows = await db
    .select({ name: uniqueItems.name, stats: uniqueItems.stats })
    .from(uniqueItems)
    .where(
      and(
        eq(uniqueItems.patch_version_id, patchVersionId),
        sql`array_length(${uniqueItems.stats}, 1) > 0`,
        or(
          nameMatch(tokens, uniqueItems.name),
          ...tokens.map(
            (t) => sql`array_to_string(${uniqueItems.stats}, ' ') ILIKE ${"%" + escapeLike(t) + "%"}`,
          ),
        )!,
      ),
    )
    .limit(12);

  return rows
    .filter((r) => r.name !== excludeName)
    .map((r) => ({ name: r.name, stats: r.stats }))
    .slice(0, 10);
}
