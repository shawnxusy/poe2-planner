# @poe2/engine

PoB share-code parsing + authoritative damage/defense calc for the PoE2 Planner.

## What this package does

- **Parse PoB-PoE2 share codes** into a structured `BuildInput` (passives, items, skills, configuration). See `src/pob/`.
- **Run a build through PoB-PoE2's actual calc engine** via a long-running luajit subprocess (`pob-bridge`). Authoritative numbers; we don't reimplement PoB's math. See `src/pob-bridge/`.
- **Inspect a build's modifiers** (resolver, parser, mod targets) for UI/AI-scoring use cases that don't need final stats. See `src/modifiers/`.

## What this package deliberately doesn't do

- It does **not** compute damage or defense in TypeScript. We tried; it required heavy back-solved calibration constants that didn't generalise across archetypes. PoB-PoE2 already does this correctly with thousands of person-hours of refinement; we orchestrate.
- It does **not** vendor PoB-PoE2's data tables. PoB itself reads them at calc time. We may codegen typed manifests for specific tables (e.g. `ConfigOptions`) when we have a concrete TS-side consumer — see "Codegen" below.

## Setup

The bridge needs **luajit** and **lua-utf8** (a C extension PoB depends on), plus a clone of PoB-PoE2:

```bash
brew install luajit luarocks
luarocks --lua-version 5.1 install luautf8
git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2 /tmp/pob-poe2
```

Override the clone path via `new PobBridge({ pobRoot: "/some/other/path" })` if needed (e.g. pinning a specific commit in production).

The bridge tests skip when luajit isn't on PATH, so `pnpm test` works on machines without the setup — just at reduced coverage.

## File layout

```
src/
  index.ts            Public API surface (everything below is exported)
  calculate.ts        Top-level calculate(build, { pobXml }) → CalcResult

  pob/                PoB share-code I/O
    codec.ts          decodePobCode / encodePobCode (URL-safe Base64 + zlib)
    xml.ts            XML → JS object (fast-xml-parser)
    item-text.ts      PoB item-body text → ItemAffix[]
    build-input.ts    XML → BuildInput (passives, items, skills, config)
    player-stats.ts   Extract embedded <PlayerStat> values from XML
                      ↑ Tier 1's primary surface — these are PoB's saved
                        snapshot stats, no recalc needed.

  modifiers/          Build inspection + scoring heuristics
    types.ts          ModEntry, ModSet, ModTarget, ModScope, etc.
    parser.ts         "12% increased Cold Damage" → ModEntry
    stat-mapping.ts   RePoE stat_id → ModTarget mapping for passives
    skill-base.ts     Pull skill stat_sets + support gem mods
    categorize.ts     Assign hit/dot/defense/etc. scope to a mod
    conditions.ts     Gate conditional mods by active conditions
    resolver.ts       BuildInput + GameData → ModSet
                      ↑ Use for "what's in this build" UI, future
                        BuildInput → PoB XML serializer for AI builds.
                        DO NOT use to compute final stats.

  pob-bridge/         Subprocess wrapper around PoB headless
    index.ts          PobBridge class (Node side: spawn + JSON-RPC)
    config-options.ts (codegen) typed ConfigInputs interface
    config-options.json (codegen) vendored manifest snapshot
    inject-config.ts  Splice ConfigInputs into a build XML
    *.test.ts         Integration tests (skip if luajit absent)

  data/               In-memory snapshot of patch data from DB
    types.ts          GameData, PassiveRecord, SkillRecord, ModRecord
    load.ts           loadGameData() → GameData (called once per process)

lua-bridge/           Lua source loaded by the subprocess
  server.lua          JSON-RPC loop appended after PoB's HeadlessWrapper
  dump-config-options.lua  Diagnostic: dump PoB's ConfigOptions table

scripts/              Dev-time tools (not part of the published surface)
  test-bridge.ts            Manual smoke test of the bridge
  regen-config-manifest.ts  Codegen the ConfigOptions TS interface
  dump-resolver.ts          Debug: print resolver output for a fixture
  dump-skill.ts             Debug: print skill metadata
  dump-skill-raw.ts         Debug: print raw RePoE skill row

test-fixtures/        Real PoB share codes used by integration tests
```

## How the bridge works

```
┌──────────────┐    JSON-RPC over stdio    ┌────────────────┐
│ Node app     │ ───────────────────────►  │ luajit child   │
│ PobBridge    │ ◄───────────────────────  │ HeadlessWrapper│
└──────────────┘                           │ + server.lua   │
                                           │ (loads PoB-PoE2│
                                           │  modules from  │
                                           │  /tmp/pob-poe2)│
                                           └────────────────┘
```

Boot cost ~535ms (one-time per process). Per-calc latency ~330–500ms. State persists between calls — the AI build mutator can iterate cheaply (no boot cost per mutation). One process is fine for a single Node worker; for parallel calc, spawn multiple `PobBridge` instances or pool them.

Protocol — line-delimited JSON:

```
request:  {"id": <num>, "method": "calc", "xml": "<pob xml>", "stats": ["CombinedDPS", ...]}
response: {"id": <same>, "result": { "CombinedDPS": 449538, ... }}
          {"id": <same>, "error": "..."}
```

Stats requested by name — PoB's `mainOutput` is a flat dict keyed by `CombinedDPS`, `Life`, `EnergyShield`, `Evasion`, `FireResist`, etc. (~hundreds of keys). Pass `stats: []` to get the full dict (slower JSON serialise).

**Use `mainOutput` not `calcsOutput`.** The latter is scoped to the Calcs tab's `skill_number` input, which defaults to `1`. Build-headline stats want `mainOutput` (already what `PobBridge.calc()` reads).

## Codegen

PoB exposes structured tables we type-safely vendor when there's a TS consumer. Right now: only `ConfigOptions`.

```bash
pnpm regen-config-manifest          # writes config-options.{json,ts}
```

The generated TS includes:

- `ConfigInputs` — typed map of optional Config Input values (544 entries).
- `ConfigOptionMeta` + `CONFIG_OPTIONS_MANIFEST` — runtime introspection (label/tooltip/gating predicates) for UI rendering.
- `configInputsToXml()` + `injectConfigInputs()` — splice a `ConfigInputs` into a build XML's active `<ConfigSet>` before sending through the bridge.

Re-run the codegen whenever PoB-PoE2 upstream patches the Configuration tab (~bi-weekly). CI can call it; if the JSON diff is non-empty there are new options to consider.

The same pattern works for any `data.*` table in PoB: `data.characterConstants` (life/mana per level, charge maxes), `data.hollowPalmAddedPhys` (per-gem-level lookup), `data.monsterLifeTable[level]`, etc. Add a `lua-bridge/dump-X.lua` + a Node codegen script when you need it.

## What NOT to do

- ❌ Re-introduce a TS-side damage/defense calc with calibrated constants. We deleted that for good reasons; if you find yourself writing `DEFAULT_BASE_CRIT = 5` or `LIFE_PER_LEVEL = 12`, stop and read `CLAUDE.md` at the repo root.
- ❌ Use `build.calcsTab.calcsOutput` for headline stats (it's the Calcs tab's view, not the build view).
- ❌ Treat PoB's `<Buffs>` element as input — it's output (PoB writes it at save-time; nothing reads it).
- ❌ Run vitest from the repo root — `dotenv` only loads in `packages/engine` cwd. Always `pnpm --filter @poe2/engine test`.
- ❌ Vendor PoB-PoE2's `Data/` directory into our repo. It's 20+MB and changes every patch; the bridge reads it from `/tmp/pob-poe2`.

## Testing

```bash
pnpm test              # all 69 tests
pnpm test src/pob/     # just one subdir
pnpm typecheck         # tsc --noEmit
```

Test breakdown:

- `src/pob/`            17 tests   parser/codec/build-input
- `src/modifiers/`      42 tests   parser/categorize/resolver
- `src/data/`            3 tests   live DB integration (needs DATABASE_URL)
- `src/pob-bridge/`      7 tests   bridge integration (needs luajit; auto-skips otherwise)

The bridge tests boot a real luajit subprocess and load real PoB; they take ~5s on first run, ~1s subsequent. Use `bridge.test.ts` to verify your changes don't break the contract.

## Known gaps

- `buildToPobXml(build)` in `calculate.ts` is stubbed. `calculate()` currently requires `opts.pobXml` (decoded from a share code). When we tackle Tier 2 (AI-generated builds with no share code), this is the first thing to implement — reverse direction of `xmlToBuildInput`.
- Bridge production deployment isn't wired. Local dev works (`/tmp/pob-poe2` clone). For Railway, we'll need a Dockerfile that bundles luajit + lua-utf8 + the PoB repo at a pinned commit.
- `PobBridge` doesn't pool. Single subprocess per instance. Good enough for one Node worker; if we ever do parallel calc, see `BridgeOptions` for the spawn surface.
