// PoB ships items as multi-line text inside <Item> elements. The format is
// shared with imports from the in-game stash (real items render the same).
//
// Layout:
//   Rarity: RARE | UNIQUE | MAGIC | NORMAL
//   <Item Name (rare/unique only)>
//   <Base Name>
//   [Quality: N]              (optional)
//   [Sockets: S S S]          (optional, space-separated)
//   [Rune: …]                 (optional, repeatable)
//   [Implicits: N]
//   <implicit lines × N>      (each may have {tags:…} prefix)
//   <explicit mod lines>      (each may have prefixes: {tags:…}{variant:…}
//                              {fractured}{enchant}{desecrated}{rune}{crafted}…)
//   [Corrupted]               (sometimes appears at end as a trailing flag)
//
// Some items also carry an "Item Level: N", "LevelReq: N", "Unique ID: …",
// "Charm Slots: N" line — we capture them as headers but ignore for now.
//
// The mod-line `{prefix}` reuse the PoB Lua format we already handle in the
// PoB Lua parser, so the splitting logic is the same.

import type { BuildItem, ItemAffix, ItemRarity, ItemSlot } from "@poe2/types";

interface ParsedItemMod {
  text: string;
  tags: string[];
  flags: string[];
}

function parseModLine(line: string): ParsedItemMod {
  const tags: string[] = [];
  const flags: string[] = [];
  let rest = line;
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
    } else {
      flags.push(prefix);
    }
  }
  return { text: rest.trim(), tags, flags };
}

const HEADER_PREFIXES = [
  "Rarity:",
  "Unique ID:",
  "Item Level:",
  "LevelReq:",
  "Quality:",
  "Sockets:",
  "Rune:",
  "Charm Slots:",
  "Has",
  "Implicits:",
  "Crafted:",
  "Selected Variant:",
  "Has Variants:",
  "Item Class:",
];

function isHeaderLine(line: string): boolean {
  return HEADER_PREFIXES.some((p) => line.startsWith(p));
}

export interface ParsedPobItem {
  rarity: ItemRarity;
  // Rare/unique items have a separate display name; magic/normal don't.
  display_name: string | null;
  base_item_name: string;
  item_level?: number;
  required_level?: number;
  quality?: number;
  sockets?: string[];
  runes?: string[];
  implicits: ItemAffix[];
  affixes: ItemAffix[];
  is_corrupted: boolean;
  raw_lines: string[];
}

export function parsePobItemText(body: string): ParsedPobItem {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let i = 0;
  let rarityLine = lines[i];
  if (!rarityLine?.startsWith("Rarity:")) {
    throw new Error(`parsePobItemText: missing Rarity header in body: ${body.slice(0, 80)}`);
  }
  const rarityRaw = rarityLine.slice("Rarity:".length).trim().toUpperCase();
  const rarityMap: Record<string, ItemRarity> = {
    NORMAL: "normal",
    MAGIC: "magic",
    RARE: "rare",
    UNIQUE: "unique",
  };
  const rarity = rarityMap[rarityRaw];
  if (!rarity) {
    throw new Error(`parsePobItemText: unknown rarity "${rarityRaw}"`);
  }
  i++;

  // Names: rare/unique have a display name on its own line; magic/normal don't.
  let display_name: string | null = null;
  let base_item_name: string;
  if (rarity === "rare" || rarity === "unique") {
    display_name = lines[i] ?? "";
    i++;
    base_item_name = lines[i] ?? "";
    i++;
  } else {
    base_item_name = lines[i] ?? "";
    i++;
  }

  // Walk header lines until we either run out or hit a non-header (= mods).
  let item_level: number | undefined;
  let required_level: number | undefined;
  let quality: number | undefined;
  let sockets: string[] | undefined;
  const runes: string[] = [];
  let implicit_count = 0;
  while (i < lines.length && isHeaderLine(lines[i]!)) {
    const ln = lines[i]!;
    if (ln.startsWith("Item Level:")) item_level = parseHeaderInt(ln);
    else if (ln.startsWith("LevelReq:")) required_level = parseHeaderInt(ln);
    else if (ln.startsWith("Quality:")) quality = parseHeaderInt(ln);
    else if (ln.startsWith("Sockets:"))
      sockets = ln.slice("Sockets:".length).trim().split(/\s+/).filter(Boolean);
    else if (ln.startsWith("Rune:")) runes.push(ln.slice("Rune:".length).trim());
    else if (ln.startsWith("Implicits:")) implicit_count = parseHeaderInt(ln) ?? 0;
    // Ignore Unique ID / Charm Slots / "Has …" descriptive lines for now.
    i++;
  }

  // Next `implicit_count` non-empty lines are implicits, the rest are explicits.
  // Some items emit a trailing "Corrupted" flag.
  const implicits: ItemAffix[] = [];
  const affixes: ItemAffix[] = [];
  let is_corrupted = false;

  let consumed = 0;
  while (i < lines.length) {
    const ln = lines[i]!;
    i++;
    if (ln === "Corrupted") {
      is_corrupted = true;
      continue;
    }
    if (ln.startsWith("<") || isHeaderLine(ln)) continue; // safety
    const parsed = parseModLine(ln);
    const affix: ItemAffix = {
      mod_id: null,
      text: parsed.text,
      values: extractRanges(parsed.text),
    };
    if (consumed < implicit_count) {
      implicits.push(affix);
    } else {
      affixes.push(affix);
    }
    consumed++;
  }

  return {
    rarity,
    display_name,
    base_item_name,
    item_level,
    required_level,
    quality,
    sockets,
    runes: runes.length > 0 ? runes : undefined,
    implicits,
    affixes,
    is_corrupted,
    raw_lines: lines,
  };
}

function parseHeaderInt(line: string): number | undefined {
  const colon = line.indexOf(":");
  if (colon === -1) return undefined;
  const n = Number.parseInt(line.slice(colon + 1).trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

// Pulls the leading numeric value(s) from a mod text. PoB stores "+(5-8) to
// Strength" but the rolled value is fixed when on a real item — `+8 to
// Strength`. For unrolled bases the values list is empty.
function extractRanges(text: string): number[] {
  const out: number[] = [];
  const re = /(?:\+|-)?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseFloat(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// Map PoB's slot label strings (used in <Slot name="…">) to our ItemSlot enum.
// Some PoB labels are aliases; we accept both. Returns null for slots we
// don't model yet (Flask 1, Belt charm, weapon swaps as separate slots).
const SLOT_MAP: Record<string, ItemSlot> = {
  Weapon: "weapon",
  "Weapon 1": "weapon",
  "Weapon 1 Swap": "weapon",
  "Weapon 2": "offhand",
  "Weapon 2 Swap": "offhand",
  Offhand: "offhand",
  Helmet: "helmet",
  "Body Armour": "body_armour",
  Gloves: "gloves",
  Boots: "boots",
  Amulet: "amulet",
  "Ring 1": "ring_left",
  "Ring 2": "ring_right",
  Belt: "belt",
};

export function mapPobSlot(label: string): ItemSlot | null {
  return SLOT_MAP[label] ?? null;
}

export function pobItemToBuildItem(p: ParsedPobItem, slot: ItemSlot): BuildItem {
  return {
    slot,
    base_item: p.base_item_name,
    rarity: p.rarity,
    unique_name: p.rarity === "unique" ? p.display_name : null,
    implicits: p.implicits,
    affixes: p.affixes,
    is_corrupted: p.is_corrupted,
  };
}
