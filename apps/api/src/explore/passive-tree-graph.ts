// Passive tree adjacency graph for BFS-based proximity queries.
//
// Loads all passive nodes for the given patch from the DB once (at startup or
// on first use), builds an adjacency map, and answers two questions:
//
//   shortestPath(nodeIdA, nodeIdB) → number of passive points needed to connect
//   classStartNodeId(className)    → the node_id of that class's starting node
//
// "Passive points" = edges traversed on the shortest path. Class start nodes
// are 0-cost (already allocated), so connecting from start to a 1-hop notable
// costs 0 points (the start node itself) — callers should subtract 1 if they
// want "allocations needed beyond what's already spent".

import { db, passives } from "@poe2/db";
import { eq, isNotNull } from "drizzle-orm";

interface GraphNode {
  nodeId: string;
  name: string;
  type: string;
  connections: number[];
}

// Class → ascendancy_start node_id lookup; populated from node names which
// include the ascendancy name (e.g. "Invoker" node is named "Invoker").
// For main-tree class starts we look for type="class_start".
// PoE2 class start nodes aren't marked in tree.lua (no classStartIndex), so
// we use the well-known starting nodes from RePoE which the passive-tree ingest
// stores as type "ascendancy_start" for ascendancy gates, and we rely on the
// caller passing actual numeric start node IDs for the main tree.

export class PassiveTreeGraph {
  // skill_id (string) → adjacency entry
  private nodes = new Map<string, GraphNode>();
  // adjacency by numeric id as well (connections[] store integers)
  private byNumericId = new Map<number, string>();

  private constructor() {}

  static async load(patchVersionId: number): Promise<PassiveTreeGraph> {
    const g = new PassiveTreeGraph();

    const rows = await db
      .select({
        node_id: passives.node_id,
        name: passives.name,
        type: passives.type,
        connections: passives.connections,
      })
      .from(passives)
      .where(eq(passives.patch_version_id, patchVersionId));

    for (const r of rows) {
      g.nodes.set(r.node_id, {
        nodeId: r.node_id,
        name: r.name,
        type: r.type,
        connections: r.connections ?? [],
      });
      // Build numeric→string id index so we can traverse connections[].
      // node_id formats: "12345" (plain PoB integer), "pob_asc_12345" (ascendancy).
      const stripped = r.node_id.startsWith("pob_asc_")
        ? r.node_id.slice(8)
        : r.node_id;
      const numeric = parseInt(stripped, 10);
      if (!isNaN(numeric)) {
        g.byNumericId.set(numeric, r.node_id);
      }
    }

    return g;
  }

  // BFS from startNodeId to targetNodeId.
  // Returns the number of edges (passive allocations) on the shortest path,
  // or null if no path exists (disconnected, or node unknown).
  shortestPath(startNodeId: string, targetNodeId: string): number | null {
    if (!this.nodes.has(startNodeId) || !this.nodes.has(targetNodeId)) {
      return null;
    }
    if (startNodeId === targetNodeId) return 0;

    const visited = new Set<string>();
    const queue: Array<[string, number]> = [[startNodeId, 0]];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const [current, dist] = queue.shift()!;
      const node = this.nodes.get(current);
      if (!node) continue;

      for (const neighborNum of node.connections) {
        const neighborId = this.byNumericId.get(neighborNum);
        if (!neighborId) continue;
        if (neighborId === targetNodeId) return dist + 1;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([neighborId, dist + 1]);
        }
      }
    }
    return null;
  }

  // Find a node by name (case-insensitive). Returns the first match.
  findByName(name: string): GraphNode | undefined {
    const lower = name.toLowerCase();
    for (const node of this.nodes.values()) {
      if (node.name.toLowerCase() === lower) return node;
    }
    return undefined;
  }

  // Find all nodes of a given type.
  byType(type: string): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node);
    }
    return result;
  }

  get size(): number {
    return this.nodes.size;
  }
}

// Singleton cache keyed by patchVersionId.
const cache = new Map<number, PassiveTreeGraph>();

export async function getPassiveTreeGraph(patchVersionId: number): Promise<PassiveTreeGraph> {
  if (!cache.has(patchVersionId)) {
    cache.set(patchVersionId, await PassiveTreeGraph.load(patchVersionId));
  }
  return cache.get(patchVersionId)!;
}
