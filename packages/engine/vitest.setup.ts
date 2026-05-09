import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env from the repo root so integration tests that touch the live DB
// (e.g., data/load.test.ts) have DATABASE_URL available before any module
// that imports @poe2/db is hoisted.
loadEnv({ path: resolve(__dirname, "../../.env") });
