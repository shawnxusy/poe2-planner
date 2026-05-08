import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected via .env at repo root)");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
