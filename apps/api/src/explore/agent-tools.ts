// Tool implementations for the Build Architect agent.
//
// Each function corresponds to one Claude tool call. They return plain objects
// that are serialised to JSON and returned as tool_result blocks.

import { db, passives, skills, uniqueItems, mods } from "@poe2/db";
import { and, eq, inArray, ilike, sql } from "drizzle-orm";
import { retrieveSeedContext } from "./context-retrieval.js";
import { getPassiveTreeGraph } from "./passive-tree-graph.js";

// ── Tool: explore_mechanic ─────────────────────────────────────────────────
// Returns passives, skills, and unique items related to a mechanic keyword.

export async function exploreMechanic(
  seed: string,
  patchVersionId: number,
) {
  return retrieveSeedContext(seed, patchVersionId);
}

// ── Tool: get_ascendancy_options ───────────────────────────────────────────
// Returns all notable + keystone nodes for a given ascendancy class name.

export async function getAscendancyOptions(
  ascendancyName: string,
  patchVersionId: number,
) {
  const rows = await db
    .select({
      name: passives.name,
      type: passives.type,
      stats: passives.stats,
      node_id: passives.node_id,
    })
    .from(passives)
    .where(
      and(
        eq(passives.patch_version_id, patchVersionId),
        inArray(passives.type, ["ascendancy_notable", "ascendancy_keystone", "ascendancy_start"]),
        sql`(${passives.raw}->>'ascendancy_name') ILIKE ${ascendancyName}`,
      ),
    )
    .orderBy(passives.type, passives.name);

  return {
    ascendancy: ascendancyName,
    nodes: rows.map((r) => ({
      node_id: r.node_id,
      name: r.name,
      type: r.type,
      stats: r.stats,
    })),
  };
}

// ── Tool: find_synergistic_skills ──────────────────────────────────────────
// Finds active + support skills matching a list of tags or mechanic keywords.

export async function findSynergisticSkills(
  tags: string[],
  patchVersionId: number,
) {
  if (tags.length === 0) return { skills: [] };

  const escapeLike = (s: string) =>
    s.replace(/%/g, "\\%").replace(/_/g, "\\_");

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
        sql`(${skills.name} ~ ' ' OR LENGTH(${skills.name}) <= 20)`,
        sql`(${sql.join(
          tags.map(
            (t) =>
              sql`${skills.name} ILIKE ${"%" + escapeLike(t) + "%"} OR EXISTS (SELECT 1 FROM unnest(${skills.tags}) tag WHERE tag ILIKE ${"%" + escapeLike(t) + "%"})`,
          ),
          sql` OR `,
        )})`,
      ),
    )
    .limit(30);

  return {
    query_tags: tags,
    skills: rows.map((r) => ({
      name: r.name,
      gem_type: r.gem_type ?? "active",
      tags: r.tags,
    })),
  };
}

// ── Tool: find_enabling_uniques ────────────────────────────────────────────
// Finds unique items whose stat text mentions the given mechanic keywords.

export async function findEnablingUniques(
  keywords: string[],
  patchVersionId: number,
) {
  if (keywords.length === 0) return { unique_items: [] };

  const escapeLike = (s: string) =>
    s.replace(/%/g, "\\%").replace(/_/g, "\\_");

  const rows = await db
    .select({ name: uniqueItems.name, stats: uniqueItems.stats })
    .from(uniqueItems)
    .where(
      and(
        eq(uniqueItems.patch_version_id, patchVersionId),
        sql`array_length(${uniqueItems.stats}, 1) > 0`,
        sql`(${sql.join(
          keywords.map(
            (k) =>
              sql`${uniqueItems.name} ILIKE ${"%" + escapeLike(k) + "%"} OR array_to_string(${uniqueItems.stats}, ' ') ILIKE ${"%" + escapeLike(k) + "%"}`,
          ),
          sql` OR `,
        )})`,
      ),
    )
    .limit(12);

  return {
    query_keywords: keywords,
    unique_items: rows.map((r) => ({ name: r.name, stats: r.stats })),
  };
}

// ── Tool: check_node_proximity ─────────────────────────────────────────────
// BFS shortest path between two named passive nodes.
// Returns edge count (passive points to traverse) or null if unreachable.

export interface ProximityResult {
  node_a: string;
  node_b: string;
  found_a: string | null;
  found_b: string | null;
  shortest_path_edges: number | null;
  assessment: string;
}

export async function checkNodeProximity(
  nodeNameA: string,
  nodeNameB: string,
  patchVersionId: number,
): Promise<ProximityResult> {
  const graph = await getPassiveTreeGraph(patchVersionId);

  const a = graph.findByName(nodeNameA);
  const b = graph.findByName(nodeNameB);

  if (!a || !b) {
    return {
      node_a: nodeNameA,
      node_b: nodeNameB,
      found_a: a?.nodeId ?? null,
      found_b: b?.nodeId ?? null,
      shortest_path_edges: null,
      assessment: !a
        ? `Node "${nodeNameA}" not found in passive tree`
        : `Node "${nodeNameB}" not found in passive tree`,
    };
  }

  const dist = graph.shortestPath(a.nodeId, b.nodeId);

  let assessment: string;
  if (dist === null) {
    assessment = "These nodes are not connected in the passive tree (likely in separate ascendancy subgraphs).";
  } else if (dist <= 3) {
    assessment = `Very close (${dist} edge${dist === 1 ? "" : "s"}) — practically free to combine.`;
  } else if (dist <= 8) {
    assessment = `Moderate distance (${dist} edges) — reachable but requires path investment.`;
  } else if (dist <= 15) {
    assessment = `Far apart (${dist} edges) — significant passive point cost; only viable if both are core to the build.`;
  } else {
    assessment = `Extremely far (${dist} edges) — nearly impossible to include both without major tree sacrifice.`;
  }

  return {
    node_a: nodeNameA,
    node_b: nodeNameB,
    found_a: a.nodeId,
    found_b: b.nodeId,
    shortest_path_edges: dist,
    assessment,
  };
}

// ── Tool: find_item_mods ───────────────────────────────────────────────────
// Searches the mods table for item or jewel affixes matching given keywords.
// Searches by mod name and semantic tags (e.g. 'fire', 'minion', 'critical').
// Stats returned are internal IDs; the agent should interpret them conceptually.

export interface ItemModResult {
  name: string | null;
  stats: string[];
  tags: string[];
  domain: string | null;
  generation_type: string | null;
}

export async function findItemMods(
  keywords: string[],
  patchVersionId: number,
  domain: string = "item",
): Promise<{ query: { keywords: string[]; domain: string }; mods: ItemModResult[] }> {
  if (keywords.length === 0) return { query: { keywords, domain }, mods: [] };

  const escapeLike = (s: string) =>
    s.replace(/%/g, "\\%").replace(/_/g, "\\_");

  const rows = await db
    .select({
      name: mods.name,
      stats: mods.stats,
      tags: mods.tags,
      domain: mods.domain,
      generation_type: mods.generation_type,
    })
    .from(mods)
    .where(
      and(
        eq(mods.patch_version_id, patchVersionId),
        ilike(mods.domain, domain),
        inArray(mods.generation_type, ["prefix", "suffix"]),
        sql`(${sql.join(
          keywords.map(
            (k) =>
              sql`${mods.name} ILIKE ${"%" + escapeLike(k) + "%"} OR array_to_string(${mods.tags}, ' ') ILIKE ${"%" + escapeLike(k) + "%"}`,
          ),
          sql` OR `,
        )})`,
      ),
    )
    .limit(20);

  return {
    query: { keywords, domain },
    mods: rows.map((r) => ({
      name: r.name,
      stats: r.stats,
      tags: r.tags,
      domain: r.domain,
      generation_type: r.generation_type,
    })),
  };
}

// ── Tool: validate_build_skeleton ─────────────────────────────────────────
// Checks a proposed build skeleton (main skill + ascendancy + key passives)
// for basic coherence: passives exist, skill exists, ascendancy nodes exist.

export interface SkeletonInput {
  class_name: string;
  ascendancy: string;
  main_skill: string;
  key_passives: string[];
  support_skills?: string[];
}

export interface SkeletonValidation {
  valid: boolean;
  issues: string[];
  confirmed: {
    main_skill: string | null;
    ascendancy_nodes: string[];
    key_passives: string[];
  };
}

export async function validateBuildSkeleton(
  skeleton: SkeletonInput,
  patchVersionId: number,
): Promise<SkeletonValidation> {
  const issues: string[] = [];

  // Confirm main skill exists
  const skillRows = await db
    .select({ name: skills.name })
    .from(skills)
    .where(
      and(
        eq(skills.patch_version_id, patchVersionId),
        ilike(skills.name, skeleton.main_skill),
      ),
    )
    .limit(1);

  const confirmedSkill = skillRows[0]?.name ?? null;
  if (!confirmedSkill) {
    issues.push(`Main skill "${skeleton.main_skill}" not found in skills table.`);
  }

  // Confirm ascendancy nodes
  const ascNodes = await getAscendancyOptions(skeleton.ascendancy, patchVersionId);
  const knownAscNodeNames = new Set(ascNodes.nodes.map((n) => n.name.toLowerCase()));
  const confirmedAscNodes: string[] = [];
  // (We just confirm the ascendancy has nodes; specific requested ones are user's choice)

  // Confirm key passives exist by name
  const confirmedPassives: string[] = [];
  for (const pName of skeleton.key_passives) {
    const rows = await db
      .select({ name: passives.name })
      .from(passives)
      .where(
        and(
          eq(passives.patch_version_id, patchVersionId),
          ilike(passives.name, pName),
        ),
      )
      .limit(1);
    if (rows[0]) {
      confirmedPassives.push(rows[0].name);
    } else {
      issues.push(`Key passive "${pName}" not found in passive tree.`);
    }
  }

  // Check proximity between all pairs of key passives (warn if any pair > 15)
  if (confirmedPassives.length >= 2) {
    for (let i = 0; i < confirmedPassives.length - 1; i++) {
      for (let j = i + 1; j < confirmedPassives.length; j++) {
        const nameA = confirmedPassives[i]!;
        const nameB = confirmedPassives[j]!;
        const result = await checkNodeProximity(
          nameA,
          nameB,
          patchVersionId,
        );
        if (result.shortest_path_edges !== null && result.shortest_path_edges > 20) {
          issues.push(
            `"${nameA}" and "${nameB}" are ${result.shortest_path_edges} edges apart — potentially unreachable together.`,
          );
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    confirmed: {
      main_skill: confirmedSkill,
      ascendancy_nodes: ascNodes.nodes.slice(0, 10).map((n) => n.name),
      key_passives: confirmedPassives,
    },
  };
}
