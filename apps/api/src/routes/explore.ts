// POST /api/builds/explore
//
// Runs the Build Architect agent against a free-text seed and streams the
// reasoning + final recommendation as Server-Sent Events (SSE).
//
// Request body: { seed: string }
// Response: text/event-stream
//   data: {"type":"text","text":"..."}\n\n
//   data: {"type":"done"}\n\n
//   data: {"type":"error","message":"..."}\n\n

import type { FastifyInstance } from "fastify";
import { runBuildArchitect } from "../explore/build-architect-agent.js";
import { currentPatchVersionId } from "../lib/current-patch.js";

interface ExploreBody {
  seed?: unknown;
}

export async function exploreRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/builds/explore", async (req, reply) => {
    const body = (req.body ?? {}) as ExploreBody;
    const seed = typeof body.seed === "string" ? body.seed.trim() : "";
    if (!seed) {
      return reply.code(400).send({ error: "missing 'seed' in request body" });
    }

    const patchVersionId = await currentPatchVersionId();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (payload: object) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const chunk of runBuildArchitect({ seed, patchVersionId })) {
        send({ type: "text", text: chunk });
      }
      send({ type: "done" });
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      reply.raw.end();
    }
  });
}
