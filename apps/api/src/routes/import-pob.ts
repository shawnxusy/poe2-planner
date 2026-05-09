// POST /api/builds/import-pob
//
// Accepts a PoB-PoE2 share code, returns:
//   - the build header (class, ascendancy, level)
//   - parsed BuildInput (passives, items, skills, config)
//   - PoB's embedded <PlayerStat> snapshot (authoritative numbers — no recalc)
//
// This is the Tier 1 surface: importing a community-shared build and
// surfacing its stats verbatim. No bridge needed — PlayerStat values are
// what PoB itself computed at save-time.

import type { FastifyInstance } from "fastify";
import {
  decodePobCode,
  derivedStats,
  extractBuildHeader,
  extractPlayerStats,
  parsePobXml,
  xmlToBuildInput,
} from "@poe2/engine";

interface ImportPobBody {
  code?: unknown;
}

export async function importPobRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/builds/import-pob", async (req, reply) => {
    const body = (req.body ?? {}) as ImportPobBody;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return reply.code(400).send({
        error: "missing 'code' (PoB share code) in request body",
      });
    }

    let xml: string;
    try {
      xml = decodePobCode(code);
    } catch (err) {
      return reply.code(400).send({
        error: "could not decode PoB share code",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    let root;
    try {
      root = parsePobXml(xml);
    } catch (err) {
      return reply.code(400).send({
        error: "could not parse PoB XML",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    const header = extractBuildHeader(root);
    const playerStats = extractPlayerStats(root);
    const stats = derivedStats(playerStats);

    let converted;
    try {
      converted = xmlToBuildInput(root);
    } catch (err) {
      return reply.code(422).send({
        error: "could not convert PoB XML to BuildInput",
        detail: err instanceof Error ? err.message : String(err),
        header,
        stats,
      });
    }

    return {
      header,
      stats,
      raw_player_stats: playerStats,
      build: converted.build,
      warnings: converted.warnings,
    };
  });
}
