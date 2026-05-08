// PoB Lua unique items use a fixed text format inside `[[...]]` Lua long-string
// literals. Each block looks like:
//
//   [[
//   The Anvil
//   Bloodstone Amulet
//   Variant: Pre 0.2.0
//   Variant: Pre 0.4.0
//   Variant: Current
//   Source: Drops from unique{Boss}
//   Implicits: 1
//   {tags:life}+(30-40) to maximum Life
//   {variant:1,2}+(3-5)% to maximum Block chance
//   {variant:3}+(5-10)% to maximum Block chance
//   ]]
//
// Line 1: unique name
// Line 2: base item name (one of base_items.name)
// Header lines: Variant: …, Source: …, Implicits: N, League: …, etc.
// Mod lines: `{prefix1}{prefix2}…<mod text>` where prefixes can be:
//   {tags:foo,bar} - mod tags
//   {variant:1,2,3} - which variants this mod applies to
//   {range:0.5} - default value for ranged rolls
//   {crafted}, {fractured}, {essence}, {implicit}, etc. - mod source/type
//
// We extract:
//   - name + base_item_name
//   - latest-variant mod texts only (drops legacy mods)
//   - the entire raw block as `raw_lua`
//
// "Latest variant" is the highest Variant number, or all mods when no
// variants are declared.

export interface ParsedUniqueMod {
  text: string;
  tags: string[];
  flags: string[];
}

export interface ParsedUnique {
  name: string;
  base_item_name: string;
  source?: string;
  league?: string;
  implicit_count?: number;
  variants: string[];
  // Mods that apply to the latest variant (or all mods if no variants).
  mods: ParsedUniqueMod[];
  raw_lua: string;
}

function parseModLine(line: string): { mod: ParsedUniqueMod; variants: number[] } {
  const tags: string[] = [];
  const flags: string[] = [];
  const variants: number[] = [];
  let rest = line;

  // Pull off all leading `{...}` prefixes.
  while (rest.startsWith("{")) {
    const end = rest.indexOf("}");
    if (end === -1) break;
    const prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);

    const colon = prefix.indexOf(":");
    if (colon === -1) {
      flags.push(prefix);
      continue;
    }
    const key = prefix.slice(0, colon);
    const value = prefix.slice(colon + 1);
    if (key === "tags") {
      tags.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (key === "variant") {
      for (const v of value.split(",")) {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n)) variants.push(n);
      }
    } else {
      flags.push(prefix);
    }
  }

  return { mod: { text: rest.trim(), tags, flags }, variants };
}

export function parseUniqueBlock(block: string): ParsedUnique | null {
  const lines = block
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return null;

  const name = lines[0]!.trim();
  const base_item_name = lines[1]!.trim();

  const variants: string[] = [];
  let source: string | undefined;
  let league: string | undefined;
  let implicit_count: number | undefined;
  const modEntries: Array<{ mod: ParsedUniqueMod; variants: number[] }> = [];

  for (const line of lines.slice(2)) {
    if (line.startsWith("Variant:")) {
      variants.push(line.slice("Variant:".length).trim());
      continue;
    }
    if (line.startsWith("Source:")) {
      source = line.slice("Source:".length).trim();
      continue;
    }
    if (line.startsWith("League:")) {
      league = line.slice("League:".length).trim();
      continue;
    }
    if (line.startsWith("Implicits:")) {
      const n = Number.parseInt(line.slice("Implicits:".length).trim(), 10);
      if (Number.isFinite(n)) implicit_count = n;
      continue;
    }
    // Skip other header-style lines (Limited to:, Selected Variant:, Has Alt Variant:, …)
    // by detecting "Word: …" pattern with no leading `{`.
    if (!line.startsWith("{") && /^[A-Z][A-Za-z ]+:/.test(line)) {
      continue;
    }
    modEntries.push(parseModLine(line));
  }

  // Filter to the latest-variant mods. If variants exist, the "current" one
  // is the highest variant index (1-based). Mods without a {variant:…} prefix
  // apply across all variants.
  const latestVariantIndex = variants.length;
  const mods = modEntries
    .filter(({ variants: vs }) => {
      if (vs.length === 0) return true;
      return vs.includes(latestVariantIndex);
    })
    .map(({ mod }) => mod);

  return {
    name,
    base_item_name,
    source,
    league,
    implicit_count,
    variants,
    mods,
    raw_lua: block,
  };
}

// Extract every `[[...]]` block from a Lua source file and parse each.
// Empty stub files (just `return {}`) yield no blocks.
export function parseUniquesFile(luaText: string): ParsedUnique[] {
  const out: ParsedUnique[] = [];
  // Lua long strings: [[ ... ]] (we don't support [=[ ... ]=] variants since
  // the PoE2 PoB data doesn't use them).
  const re = /\[\[([\s\S]*?)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(luaText)) !== null) {
    const parsed = parseUniqueBlock(match[1]!);
    if (parsed) out.push(parsed);
  }
  return out;
}
