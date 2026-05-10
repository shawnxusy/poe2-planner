// Fastify app factory. Kept separate from server.ts so tests can build
// the app and use `app.inject()` without binding a port.

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { importPobRoutes } from "./routes/import-pob.js";
import { exploreRoutes } from "./routes/explore.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 2 * 1024 * 1024, // PoB share codes are ~50KB; cap generously
  });

  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(importPobRoutes);
  await app.register(exploreRoutes);

  return app;
}
