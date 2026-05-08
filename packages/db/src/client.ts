import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// One pooled connection per process. `prepare: false` is needed for transaction
// pooler compatibility (PgBouncer) — Railway's TCP proxy is direct so it's fine
// either way, but this keeps us safe if we ever move to a pooler.
const queryClient = postgres(databaseUrl, { prepare: false });

export const db = drizzle(queryClient, { schema });

export type DB = typeof db;
