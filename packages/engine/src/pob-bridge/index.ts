// Subprocess bridge to PoB-PoE2's calc engine.
//
// Architecture: spawn a long-running luajit process that runs the
// PathOfBuilding-PoE2 HeadlessWrapper plus our own JSON-RPC server.
// Each calc() call writes a JSON request to stdin and reads back a
// JSON response from stdout. State persists between calls so the AI
// recommender can iterate cheaply (no boot cost per mutation).
//
// Why subprocess over Lua-in-JS (fengari):
//   - Zero compatibility risk with PoB's bit/64-bit shims and
//     LuaJIT-specific patterns.
//   - Calc-heavy modules (CalcOffence ≈ 6 KLOC) run at native LuaJIT
//     speed; fengari's interpreter would be substantially slower.
//   - PoB upstream evolves (~20 commits/60d); subprocess insulates us
//     from runtime-compatibility drift.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Resolve our own directory across ESM/CJS contexts. tsx runs us as ESM in
// scripts/ but vitest may transpile as CJS.
const HERE_URL = import.meta.url;
const HERE_DIR = dirname(fileURLToPath(HERE_URL));

export interface BridgeOptions {
  // Path to the cloned PathOfBuilding-PoE2 repo. Defaults to
  // /tmp/pob-poe2 — the dev-env clone we used for the PoC. Production
  // deploys should pin a known commit and ship the tree alongside.
  pobRoot?: string;
  // Override the luajit executable. Defaults to "luajit" on PATH.
  luajitBin?: string;
  // How many times to allow a calc to fail before giving up. Useful
  // for transient errors during AI build mutation.
  maxRetries?: number;
}

interface CalcRequest {
  xml: string;
  name?: string;
  // If empty, we return the full mainOutput. Otherwise only these keys.
  stats?: string[];
}

interface RpcEnvelope<T> {
  id?: number;
  result?: T;
  error?: string;
  event?: string;
}

const DEFAULT_POB_ROOT = "/tmp/pob-poe2";
const DEFAULT_LUAJIT = "luajit";
const SERVER_LUA = resolvePath(HERE_DIR, "../../lua-bridge/server.lua");

export class PobBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private pending = new Map<number, (env: RpcEnvelope<unknown>) => void>();
  private nextId = 1;
  private readyPromise: Promise<void> | null = null;
  private opts: Required<BridgeOptions>;

  constructor(opts: BridgeOptions = {}) {
    this.opts = {
      pobRoot: opts.pobRoot ?? DEFAULT_POB_ROOT,
      luajitBin: opts.luajitBin ?? DEFAULT_LUAJIT,
      maxRetries: opts.maxRetries ?? 1,
    };
  }

  async start(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this._spawn();
    return this.readyPromise;
  }

  private _spawn(): Promise<void> {
    // PoB lives in `pobRoot/src/`. We cwd into src/ so its relative
    // module paths resolve, and inject `runtime/lua/?.lua` plus the
    // luarocks tree (for lua-utf8) into LUA_PATH/LUA_CPATH.
    const cwd = resolvePath(this.opts.pobRoot, "src");
    const env = { ...process.env };

    // Compose LUA_PATH / LUA_CPATH covering:
    //   1. PoB's own modules (./?.lua under src/)
    //   2. PoB's runtime/lua deps (xml, dkjson, etc.)
    //   3. luarocks-installed C extensions (lua-utf8 etc.)
    const home = process.env.HOME ?? "";
    const luaPathExtra = [
      "../runtime/lua/?.lua",
      "../runtime/lua/?/init.lua",
      "./?.lua",
      "./?/init.lua",
      `${home}/.luarocks/share/lua/5.1/?.lua`,
      `${home}/.luarocks/share/lua/5.1/?/init.lua`,
      "/opt/homebrew/share/lua/5.1/?.lua",
      "/opt/homebrew/share/lua/5.1/?/init.lua",
    ].join(";");
    const luaCpathExtra = [
      `${home}/.luarocks/lib/lua/5.1/?.so`,
      "/opt/homebrew/lib/lua/5.1/?.so",
    ].join(";");

    env.LUA_PATH = `${luaPathExtra};${env.LUA_PATH ?? ";"}`;
    env.LUA_CPATH = `${luaCpathExtra};${env.LUA_CPATH ?? ";"}`;

    const child = spawn(this.opts.luajitBin, [SERVER_LUA], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.rl = createInterface({ input: child.stdout });

    let resolveReady: () => void;
    let rejectReady: (err: Error) => void;
    const ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    let booted = false;
    this.rl.on("line", (line: string) => {
      let env: RpcEnvelope<unknown>;
      try {
        env = JSON.parse(line);
      } catch (err) {
        // PoB's startup prints non-JSON ("Loading main script...", etc.) —
        // ignore those; only JSON lines are protocol traffic.
        return;
      }
      if (env.event === "ready") {
        booted = true;
        resolveReady();
        return;
      }
      if (typeof env.id === "number") {
        const handler = this.pending.get(env.id);
        if (handler) {
          this.pending.delete(env.id);
          handler(env);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      // Pipe Lua errors through to our stderr for visibility, but don't
      // fail the bridge — PoB writes a lot of warnings during boot.
      process.stderr.write(chunk);
    });

    child.on("exit", (code) => {
      if (!booted) {
        rejectReady(new Error(`luajit exited before ready (code=${code})`));
      }
      // Reject any in-flight calls.
      for (const [id, handler] of this.pending) {
        handler({ id, error: `luajit exited (code=${code})` });
      }
      this.pending.clear();
      this.child = null;
    });

    return ready;
  }

  async calc(req: CalcRequest): Promise<Record<string, number | string | boolean | null>> {
    if (!this.child) await this.start();
    if (!this.child) throw new Error("bridge: subprocess unavailable");

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method: "calc", ...req });

    return new Promise((resolveP, rejectP) => {
      this.pending.set(id, (env) => {
        if (env.error) {
          rejectP(new Error(env.error));
          return;
        }
        resolveP(env.result as Record<string, number | string | boolean | null>);
      });
      this.child!.stdin.write(payload + "\n");
    });
  }

  async ping(): Promise<string> {
    if (!this.child) await this.start();
    const id = this.nextId++;
    return new Promise((resolveP, rejectP) => {
      this.pending.set(id, (env) => {
        if (env.error) rejectP(new Error(env.error));
        else resolveP(String(env.result));
      });
      this.child!.stdin.write(JSON.stringify({ id, method: "ping" }) + "\n");
    });
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.child.stdin.end();
    return new Promise((resolveP) => {
      this.child!.once("exit", () => resolveP());
      // Hard-kill after 2s if it didn't exit cleanly.
      setTimeout(() => {
        if (this.child) this.child.kill("SIGKILL");
      }, 2000).unref();
    });
  }
}
