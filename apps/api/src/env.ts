// Pre-init: load .env from repo root before any other module evaluates.
// ESM evaluates imported modules in dependency order, so importing this
// file FIRST in server.ts ensures DATABASE_URL is set before @poe2/engine
// (which transitively imports @poe2/db, which throws at module-load if
// DATABASE_URL is missing).
//
// In production (Railway) the platform sets env vars; this dotenv call is
// a no-op when the file is absent.
import { config } from "dotenv";
import { resolve as resolvePath } from "node:path";

config({ path: resolvePath(process.cwd(), "../../.env") });
