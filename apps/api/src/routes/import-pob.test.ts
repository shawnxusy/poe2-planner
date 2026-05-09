// Integration test for POST /api/builds/import-pob.
//
// Uses Fastify's `inject()` to call the route in-process (no listen),
// so the test runs in <100ms and doesn't need a live port.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import "../env.js";
import { buildApp } from "../app.js";

const fixturesDir = resolvePath(
  __dirname,
  "../../../../packages/engine/test-fixtures",
);

describe("POST /api/builds/import-pob", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("imports a real PoB share code and returns header + stats + build", async () => {
    const code = readFileSync(`${fixturesDir}/ice-strike-1.txt`, "utf-8").trim();

    const res = await app.inject({
      method: "POST",
      url: "/api/builds/import-pob",
      payload: { code },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.header.className).toBe("Monk");
    expect(body.header.ascendancy).toBe("Invoker");
    expect(body.header.level).toBe(95);

    // Embedded PlayerStat snapshot — these are what PoB itself computed.
    expect(body.stats.combined_dps).toBeGreaterThan(0);
    expect(body.stats.total_ehp).toBeGreaterThan(0);
    // Ice-strike-1 is a CI build (Life=1) with stacked ES.
    expect(body.stats.es).toBeGreaterThan(1000);

    expect(body.raw_player_stats.CombinedDPS).toBe(body.stats.combined_dps);

    // Parsed BuildInput is non-trivial.
    expect(body.build.passives.length).toBeGreaterThan(50);
    expect(body.build.items.length).toBeGreaterThan(0);
    expect(body.build.skills.length).toBeGreaterThan(0);
  });

  it("returns 400 when 'code' is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/builds/import-pob",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/missing 'code'/);
  });

  it("returns 400 when 'code' is not a valid PoB code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/builds/import-pob",
      payload: { code: "not-a-real-code" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/decode/);
  });
});
