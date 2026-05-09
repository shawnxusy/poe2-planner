# PoE2 Planner — agent orientation

For: any AI/coding agent (Claude Code, etc.) picking up this repo without prior session context.
For long-term project history and architecture rationale, also see `README.md`.

## What this is

AI-assisted build recommender + browser for Path of Exile 2 patch 0.4. TypeScript monorepo, deployed to Railway.

Three product tiers (also in `README.md`):

- **Tier 1 (current focus):** Build browser. User imports a PoB share code or browses curated builds; sees calculated DPS / EHP / key passives / required gear.
- **Tier 2 (next):** AI recommender — Claude proposes a build given an archetype prompt + budget; engine validates the numbers.
- **Tier 3 (deferred):** GGG OAuth character import.

## Current state (last updated 2026-05-09)

- Engine: **done within reason.** Authoritative damage/defense via `pob-bridge` — a Node↔luajit subprocess wrapper around Path of Building's headless mode. ALL hand-rolled calc paths have been deleted (see "Decisions" below).
- Resolver / parser: kept; used for build inspection and (eventually) `BuildInput → PoB XML` for AI-generated builds.
- ConfigOptions manifest: vendored (544 typed Config Inputs from PoB).
- Product layer: not started. No API routes, no web UI, no seed builds.
- 69 tests passing across 10 files in `packages/engine`.

**Next milestone:** Tier 1 vertical slice — `POST /api/builds/import-pob` + a paste-box web UI. Tracked in `todo_poe2_planner.md` (auto-memory).

## Decisions that aren't obvious from code

These are the load-bearing choices a fresh contributor needs to know:

1. **PoB-PoE2 headless is the single source of truth for damage/defense.** We previously had a hand-rolled in-process engine with ≤15% drift on two calibrated fixtures. It used heavy back-solved constants (Hollow Palm scaling, evasion divisor, EHP rollup choice) that didn't generalise. We deleted it. Don't re-add. If you need a stat, send the build XML through `PobBridge` (`packages/engine/src/pob-bridge/`).

2. **Resolver is for inspection, not stats.** `packages/engine/src/modifiers/resolver.ts` walks passives + items + supports + skill stat_sets and emits typed `ModEntry`s. It's used for "what's in this build" UI and (future) `BuildInput → PoB XML` generation. **Do NOT consume its output to compute final DPS/EHP.** PoB does that.

3. **Tier 1 doesn't need pob-bridge.** PoB share codes carry pre-computed `<PlayerStat>` values in their XML. For the build browser, extract those (we already have `extractPlayerStats` in `packages/engine/src/pob/player-stats.ts`). The bridge only matters when the snapshot is stale or the build was generated (Tier 2).

4. **Config state is read from PoB's own enumeration.** PoB's `Modules/ConfigOptions.lua` has 544 options with types, defaults, gating predicates. We dump it via `pnpm --filter @poe2/engine regen-config-manifest` → typed TS interface. Don't write per-archetype config branching; use the codegen'd `ConfigInputs` type and `injectConfigInputs()` helper.

5. **Item-mod local vs global was a hack.** The deleted defense path used regex heuristics to guess which armour-slot mods are "local" vs global. That logic is gone; PoB knows. If you find yourself re-implementing that distinction, you're probably re-introducing a hack.

## Repo layout

```
apps/
  api/        Fastify REST API (skeleton; routes TODO)
  web/        Next.js 15 + React 19 (skeleton; pages TODO)
packages/
  types/      Shared TS types (BuildInput, CalcResult, etc.)
  db/         Drizzle schema + client (19 tables; ingest writes, engine reads)
  ingest/     RePoE-Fork → DB pipeline (passives, mods, skills, uniques, base items)
  engine/     PoB share-code parsing + pob-bridge (THIS is the calc surface)
```

`packages/engine/` has its own `README.md` — read that for the bridge setup dance, codegen, and what each subdirectory does.

## How to run things

Local dev, from repo root:

```bash
cp .env.example .env  # fill DATABASE_URL from Railway Postgres
pnpm install
pnpm -r run typecheck
pnpm -r run test
```

Per-package:

```bash
pnpm --filter @poe2/engine test          # 69 tests, requires luajit for full bridge tests
pnpm --filter @poe2/engine regen-config-manifest   # codegen ConfigInputs from PoB
pnpm --filter @poe2/api dev               # Fastify on :3001 (only /health right now)
pnpm --filter @poe2/web dev               # Next.js on :3000 (placeholder home)
```

The engine package needs **luajit + lua-utf8** to run the bridge tests (and bridge itself). `packages/engine/README.md` has the install steps; tldr `brew install luajit luarocks && luarocks --lua-version 5.1 install luautf8`.

Bridge tests skip themselves if luajit isn't on PATH, so `pnpm test` works without the dev-env setup — just with reduced coverage.

## Common pitfalls (things that have already bitten)

- **Don't run vitest from repo root.** `dotenv` only loads in `packages/engine` cwd, so DB tests fail with "DATABASE_URL is not set". Always `pnpm --filter @poe2/engine test`.
- **PoB Config block is `<Config><ConfigSet>...</ConfigSet></Config>`**, not flat `<Config><Input>`. The build-input parser handles both, but if you write XML by hand follow the nested layout.
- **`<Buffs>` is OUTPUT, not input.** PoB writes it at save-time; there's no XML loader that reads it. Don't expect changing it to affect calc.
- **`build.calcsTab.calcsOutput` ≠ `build.calcsTab.mainOutput`.** The former is the Calcs tab's view (scoped to the Calcs `skill_number` input); the latter is the build view. We always want `mainOutput` for headline stats.
- **PoE2 != PoE1.** The PoB-PoE2 fork has subtle calc differences (charges only buff if passives allocated, no per-level attribute auto-grant, etc.). Don't port PoE1 conventions blindly.

## What lives where (deeper context)

- **`packages/engine/README.md`** — engine package reference: bridge setup, file structure, what to do / not do
- **`memory/MEMORY.md`** (auto-memory, not in repo) — index of project context files
  - `project_poe2_planner.md` — full original project context
  - `todo_poe2_planner.md` — phase-by-phase implementation checklist
  - `project_pob_bridge.md` — how the bridge works, perf notes, gaps
- **`/tmp/pob-poe2/`** — cloned upstream we depend on. Pinned commit info in `packages/engine/README.md`. **NOT vendored in our repo** because it's 30MB+; the bridge expects it at `/tmp/pob-poe2` by default (overridable via `BridgeOptions.pobRoot`).

## When in doubt

1. **Adding a calc?** Don't. Send through pob-bridge. If pob-bridge can't do it, we have a bigger problem than re-implementing.
2. **Inspecting a build?** Use the resolver (`resolve(build, game)`).
3. **Reading PoB metadata (config options, character constants, etc.)?** Add a `lua-bridge/dump-X.lua` + codegen script following the `dump-config-options.lua` pattern.
4. **Changing the bridge protocol?** Update both `lua-bridge/server.lua` and `src/pob-bridge/index.ts`. There's an integration test (`bridge.test.ts`) that pins the contract.
