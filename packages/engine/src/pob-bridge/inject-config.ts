// Splice ConfigInputs into a PoB build XML's active <ConfigSet>.
//
// PoB stores Configuration tab inputs as <Input> children of a
// <ConfigSet> inside the top-level <Config>. Multiple sets are allowed
// (combat profiles); `activeConfigSet` on <Config> picks the live one.
//
// Existing <Input name="X"/> entries get OVERRIDDEN by our profile —
// Tier-2 scoring needs uniform combat assumptions across all builds.
//
// We operate on raw XML strings (no parser dependency). PoB's XML is
// small and the structure we care about is shallow + regular.

import { configInputsToXml, type ConfigInputs } from "./config-options.js";

/**
 * Inject Config Inputs into a PoB build XML. Returns a new XML string
 * with the active <ConfigSet>'s <Input> list updated. Suitable to pass
 * as `pobXml` to bridge.calc().
 */
export function injectConfigInputs(xml: string, inputs: ConfigInputs): string {
  const names = Object.keys(inputs);
  if (names.length === 0) return xml;
  const newInputsXml = configInputsToXml(inputs);

  // Strip any pre-existing <Input name="X"/> entries we're overriding so
  // our profile wins. Conservative: scoped to a string substring, applied
  // wherever it appears (multiple ConfigSets get the same treatment so
  // switching active sets later still produces the same result).
  let out = xml;
  for (const name of names) {
    const re = new RegExp(
      `\\s*<Input\\b[^/>]*\\bname="${escapeRegex(name)}"[^/>]*/>`,
      "g",
    );
    out = out.replace(re, "");
  }

  // Locate the active <ConfigSet>. The active id lives on <Config> as
  // `activeConfigSet`; if absent, we target the first set we find.
  const configOpen = out.match(/<Config\b[^>]*>/);
  if (!configOpen) {
    // No <Config> at all — wrap and inject before the root close tag.
    const fresh = `\n<Config>\n  <ConfigSet id="1">\n${newInputsXml}\n  </ConfigSet>\n</Config>`;
    return out.replace(/<\/PathOfBuilding2?>/, `${fresh}\n$&`);
  }

  const activeId = (configOpen[0].match(/activeConfigSet="(\d+)"/) ?? [])[1];

  // Rebuild by walking ConfigSet matches and patching the chosen one.
  const setRe = /<ConfigSet\b([^>]*)>([\s\S]*?)<\/ConfigSet>/g;
  let chosenStart = -1;
  let chosenEnd = -1;
  let chosenBody = "";
  let chosenAttrs = "";
  let firstStart = -1;
  let firstEnd = -1;
  let firstBody = "";
  let firstAttrs = "";
  let m: RegExpExecArray | null;
  while ((m = setRe.exec(out)) !== null) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const id = (attrs.match(/id="([^"]+)"/) ?? [])[1];
    if (firstStart === -1) {
      firstStart = m.index;
      firstEnd = m.index + m[0].length;
      firstAttrs = attrs;
      firstBody = body;
    }
    if (activeId && id === activeId) {
      chosenStart = m.index;
      chosenEnd = m.index + m[0].length;
      chosenAttrs = attrs;
      chosenBody = body;
      break;
    }
  }
  if (chosenStart === -1) {
    // No active match — use the first set, or if there are none, append
    // a fresh ConfigSet inside the existing <Config>.
    if (firstStart === -1) {
      // No ConfigSet in <Config> — append one.
      const insertion = `\n  <ConfigSet id="1">\n${newInputsXml}\n  </ConfigSet>\n`;
      return out.replace(/<\/Config>/, `${insertion}</Config>`);
    }
    chosenStart = firstStart;
    chosenEnd = firstEnd;
    chosenAttrs = firstAttrs;
    chosenBody = firstBody;
  }

  const replaced = `<ConfigSet${chosenAttrs}>${chosenBody}\n${newInputsXml}\n</ConfigSet>`;
  return out.slice(0, chosenStart) + replaced + out.slice(chosenEnd);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
