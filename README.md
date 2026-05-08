# PoE2 Planner

AI-powered build recommender and browser for Path of Exile 2.

## Stack

- TypeScript monorepo (pnpm workspaces + Turborepo)
- PostgreSQL on Railway (shared by local dev and production)
- Next.js 14 web app, Fastify API, scheduled ingest worker

## Layout

```
apps/
  web/        Next.js 14 app — sidebar filters + build cards
  api/        Fastify REST API
packages/
  db/         Drizzle schema + migrations
  engine/     Damage / EHP calculation engine
  ingest/     Data pipeline (RePoE, poe.ninja, PoB Lua)
  types/      Shared TypeScript types
```

## Local dev

```bash
cp .env.example .env
# fill in DATABASE_URL from Railway dashboard → Postgres service → DATABASE_PUBLIC_URL

pnpm install
pnpm db:push       # apply schema to remote DB
pnpm dev           # all apps in parallel
```

The same Railway Postgres backs local and production — no local Postgres needed.

## Deployment

Railway project: `wholesome-connection` (`ad9b3557-a3c6-4556-96eb-2893f365919e`)

Services: `web`, `api`, `ingest`, `Postgres`. Pushing to `main` deploys all three app services.
