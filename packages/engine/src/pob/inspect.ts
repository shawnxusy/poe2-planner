import { decodePobCode } from "./codec.js";
import { parsePobXml } from "./xml.js";

// Diagnostic helper for working with real PoB codes during development.
// Prints the top-level XML shape so we can see what real PoB-PoE2 exports
// contain (vs. what the PoB Lua source describes).
//
// Usage from the engine package directory:
//   npx tsx src/pob/inspect.ts <code-or-path-to-text-file>
import { readFileSync } from "node:fs";

function pretty(value: unknown, indent = 0, maxDepth = 4): string {
  if (indent > maxDepth) return "…";
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") {
    const s = String(value);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  }
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  return (
    "{\n" +
    keys
      .slice(0, 30)
      .map((k) => "  ".repeat(indent + 1) + `${k}: ${pretty(obj[k], indent + 1, maxDepth)}`)
      .join("\n") +
    (keys.length > 30 ? `\n${"  ".repeat(indent + 1)}…(${keys.length - 30} more)` : "") +
    "\n" +
    "  ".repeat(indent) +
    "}"
  );
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: inspect <code-or-path>");
    process.exit(1);
  }
  let code: string;
  try {
    code = readFileSync(arg, "utf-8").trim();
  } catch {
    code = arg;
  }
  const xml = decodePobCode(code);
  console.log(`--- XML (${xml.length} bytes) ---`);
  console.log(xml.slice(0, 2000));
  console.log(xml.length > 2000 ? "\n…(truncated)\n" : "\n");
  const parsed = parsePobXml(xml);
  console.log("--- Parsed structure ---");
  console.log(pretty(parsed));
}

main();
