// Regenerate the ConfigOptions manifest by running PoB's HeadlessWrapper
// + our dump-config-options.lua, parsing the JSON, and writing two files:
//
//   src/pob-bridge/config-options.json — vendored manifest data
//   src/pob-bridge/config-options.ts   — codegen'd TS types + helpers
//
// Run: pnpm --filter @poe2/engine regen-config-manifest
//      (or directly: tsx scripts/regen-config-manifest.ts [pobRoot])
//
// Re-run whenever PoB-PoE2 upstream patches the Configuration tab.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const POB_ROOT = process.argv[2] ?? "/tmp/pob-poe2";
const HEADLESS = `${POB_ROOT}/src/HeadlessWrapper.lua`;
const DUMP = resolvePath(__dirname, "../lua-bridge/dump-config-options.lua");
const OUT_JSON = resolvePath(__dirname, "../src/pob-bridge/config-options.json");
const OUT_TS = resolvePath(__dirname, "../src/pob-bridge/config-options.ts");

interface ConfigOption {
  var: string;
  type: string;
  label?: string;
  tooltip?: string;
  defaultIndex?: number;
  defaultState?: number | boolean | string;
  ifCond?: string | string[];
  ifSkill?: string | string[];
  ifMod?: string | string[];
  ifSkillData?: string | string[];
  ifFlag?: string | string[];
  ifMinionCond?: string | string[];
  ifTagType?: string | string[];
  list?: Array<{ val: string | number | boolean; label?: string }>;
}

interface Manifest {
  total: number;
  by_type: Record<string, number>;
  options: ConfigOption[];
}

function runDump(): Manifest {
  // Concat the headless boot + our dump script to a temp file so the
  // dump's globals (LoadModule, etc.) resolve. Run from src/ for PoB's
  // relative module paths.
  const tmp = "/tmp/pob-dump-config.lua";
  const combined =
    readFileSync(HEADLESS, "utf-8") + "\n" + readFileSync(DUMP, "utf-8");
  writeFileSync(tmp, combined);

  // Compose LUA_PATH/LUA_CPATH the same way pob-bridge does at runtime.
  const home = process.env.HOME ?? "";
  const luaPath = [
    "../runtime/lua/?.lua",
    "../runtime/lua/?/init.lua",
    "./?.lua",
    "./?/init.lua",
    `${home}/.luarocks/share/lua/5.1/?.lua`,
    `${home}/.luarocks/share/lua/5.1/?/init.lua`,
    "/opt/homebrew/share/lua/5.1/?.lua",
    "/opt/homebrew/share/lua/5.1/?/init.lua",
  ].join(";");
  const luaCpath = [
    `${home}/.luarocks/lib/lua/5.1/?.so`,
    "/opt/homebrew/lib/lua/5.1/?.so",
  ].join(";");

  const stdout = execSync(`luajit ${tmp}`, {
    cwd: `${POB_ROOT}/src`,
    env: {
      ...process.env,
      LUA_PATH: `${luaPath};${process.env.LUA_PATH ?? ";"}`,
      LUA_CPATH: `${luaCpath};${process.env.LUA_CPATH ?? ";"}`,
    },
    stdio: ["ignore", "pipe", "ignore"], // discard the boot banner on stderr
  }).toString("utf-8");

  // The boot banner ("Loading main script...") goes to stdout in some
  // PoB setups; the JSON is on the last line. We tolerate both layouts
  // by parsing the last non-empty line as JSON.
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  const lastLine = lines[lines.length - 1];
  if (!lastLine) throw new Error("dump produced no output");
  return JSON.parse(lastLine) as Manifest;
}

function emitTypeScript(m: Manifest): string {
  // Map PoB type names → TS value type.
  const tsType = (t: string): string => {
    switch (t) {
      case "check":
        return "boolean";
      case "count":
      case "countAllowZero":
      case "integer":
      case "float":
        return "number";
      case "list":
        return "string | number"; // actual values come from the option's list
      case "text":
        return "string";
      default:
        return "string | number | boolean";
    }
  };

  const lines: string[] = [];
  lines.push(
    "// AUTO-GENERATED — DO NOT EDIT BY HAND.",
    "// Regenerate via `tsx scripts/regen-config-manifest.ts`.",
    `// Source: PoB-PoE2 Modules/ConfigOptions.lua (${m.total} options).`,
    "",
    "export interface ConfigOptionListItem {",
    "  val: string | number | boolean;",
    "  label?: string;",
    "}",
    "",
    "export interface ConfigOptionMeta {",
    "  var: string;",
    "  type: string;",
    "  label?: string;",
    "  tooltip?: string;",
    "  defaultIndex?: number;",
    "  defaultState?: number | boolean | string;",
    "  ifCond?: string | string[];",
    "  ifSkill?: string | string[];",
    "  ifMod?: string | string[];",
    "  ifSkillData?: string | string[];",
    "  ifFlag?: string | string[];",
    "  ifMinionCond?: string | string[];",
    "  ifTagType?: string | string[];",
    "  list?: ConfigOptionListItem[];",
    "}",
    "",
    "// Every Config Input the engine knows about, by var name.",
    `export type ConfigInputVar =`,
  );
  // Emit a deduped string-literal union of var names.
  const sortedVars = Array.from(new Set(m.options.map((o) => o.var))).sort();
  for (let i = 0; i < sortedVars.length; i++) {
    const v = sortedVars[i]!.replace(/"/g, '\\"');
    const sep = i === sortedVars.length - 1 ? ";" : "";
    lines.push(`  | "${v}"${sep}`);
  }
  lines.push("");

  // Per-var typed map. We can't infer the exact TS value type for "list"
  // entries without enumerating each option's choices, so list-typed
  // options widen to `string | number`. Boolean checks stay bool, etc.
  lines.push(
    "// Typed map of optional Config Input values. Use this when constructing",
    "// a build-evaluation profile that gets injected into <Config><Input>",
    "// before the build XML hits the PoB headless calc.",
    "export interface ConfigInputs {",
  );
  // PoB occasionally registers the same `var` twice (e.g. player vs minion
  // contexts share a name). For our typed-map view we keep the first
  // declaration and skip duplicates — the input semantics are identical.
  const seen = new Set<string>();
  for (const opt of m.options) {
    if (seen.has(opt.var)) continue;
    seen.add(opt.var);
    const safe = opt.var.replace(/"/g, '\\"');
    lines.push(`  "${safe}"?: ${tsType(opt.type)};`);
  }
  lines.push("}", "");

  // Inline the manifest as a const so consumers can introspect at runtime
  // (label/tooltip/list values for UI rendering, gating for AI scoring).
  lines.push(
    "// The full manifest, available at runtime for UI tooltips, validation,",
    "// and AI tooling that wants to enumerate gating predicates.",
    "export const CONFIG_OPTIONS_MANIFEST: { total: number; by_type: Record<string, number>; options: ConfigOptionMeta[] } =",
    `  ${JSON.stringify(m, null, 2)};`,
    "",
  );

  // Helper for converting our typed map into XML <Input> elements that
  // we can splice into a build's <Config><ConfigSet>.
  lines.push(
    "// Render a ConfigInputs map into PoB-XML <Input> elements. Caller is",
    "// responsible for splicing the result into a <ConfigSet>.",
    "export function configInputsToXml(inputs: ConfigInputs): string {",
    "  const out: string[] = [];",
    "  for (const [name, value] of Object.entries(inputs) as Array<[string, unknown]>) {",
    "    if (value === undefined || value === null) continue;",
    '    const escaped = String(name).replace(/"/g, "&quot;");',
    "    if (typeof value === \"boolean\") {",
    '      out.push(`<Input name="${escaped}" boolean="${value ? "true" : "false"}"/>`);',
    "    } else if (typeof value === \"number\") {",
    '      out.push(`<Input name="${escaped}" number="${value}"/>`);',
    "    } else {",
    '      const v = String(value).replace(/"/g, "&quot;");',
    '      out.push(`<Input name="${escaped}" string="${v}"/>`);',
    "    }",
    "  }",
    "  return out.join(\"\\n\");",
    "}",
    "",
  );

  return lines.join("\n");
}

function main() {
  console.log(`Regenerating from ${POB_ROOT} ...`);
  const m = runDump();
  console.log(`  ${m.total} config options;`, m.by_type);

  mkdirSync(resolvePath(__dirname, "../src/pob-bridge"), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(m, null, 2) + "\n");
  console.log(`  wrote ${OUT_JSON}`);

  writeFileSync(OUT_TS, emitTypeScript(m));
  console.log(`  wrote ${OUT_TS}`);
}

main();
