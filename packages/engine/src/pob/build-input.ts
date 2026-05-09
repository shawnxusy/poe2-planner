// XML → BuildInput conversion for PoB-PoE2 share codes.
//
// We map PoB's section structure onto the engine's input shape:
//   Tree.Spec.@_nodes         → BuildInput.passives[].node_id (numeric hash, stringified)
//   Items.Item                → BuildInput.items (parsed from item text)
//   Items.ItemSet.Slot        → which Item id lives in which slot
//   Skills.SkillSet.Skill.Gem → BuildInput.skills (with supports nested)
//   Build.@_className/Asc/Lvl → header
//   Config.Input              → CalcAssumptions
//
// Note: PoE2 passives use numeric `hash` values in the XML, while RePoE-Fork
// gives us string `id` values (e.g. "lightning14"). We pass through the
// numeric-string here; the modifier resolver translates hash→id via a
// passives_by_hash lookup it builds from the DB once.

import {
  DEFAULT_ASSUMPTIONS,
  type BuildInput,
  type BuildItem,
  type BuildSkill,
  type CalcAssumptions,
  type EnemyType,
  type ItemSlot,
  type PassiveNode,
  type SkillRole,
  type SupportGem,
} from "@poe2/types";
import { extractBuildHeader } from "./player-stats.js";
import {
  mapPobSlot,
  parsePobItemText,
  pobItemToBuildItem,
  type ParsedPobItem,
} from "./item-text.js";
import type { PobXmlRoot } from "./xml.js";

// The sub-shapes we care about, narrowly typed against fast-xml-parser output.
interface PobGem {
  "@_skillId"?: string;
  "@_gemId"?: string;
  "@_nameSpec"?: string;
  "@_level"?: string;
  "@_quality"?: string;
  "@_enabled"?: string;
  "@_skillMinionSkill"?: string;
}

interface PobSkill {
  "@_enabled"?: string;
  "@_mainActiveSkill"?: string;
  Gem?: PobGem[];
}

interface PobSkillSet {
  "@_id"?: string;
  Skill?: PobSkill[];
}

interface PobSlot {
  "@_name"?: string;
  "@_itemId"?: string;
}

interface PobItemSet {
  "@_id"?: string;
  Slot?: PobSlot[];
}

interface PobItem {
  "@_id"?: string;
  // The text body lives in `#text` for fast-xml-parser when textNodeName
  // is the default. fxp emits the inner text under '#text' OR collapses it
  // when there are no element children — we try both.
  "#text"?: string;
}

interface PobSpec {
  "@_nodes"?: string;
  "@_classId"?: string;
  "@_ascendClassId"?: string;
  "@_treeVersion"?: string;
  "@_ascendancyInternalId"?: string;
}

interface PobConfigInput {
  "@_name"?: string;
  "@_string"?: string;
  "@_number"?: string;
  "@_boolean"?: string;
}

interface PobBuildBlock {
  "@_className"?: string;
  "@_ascendClassName"?: string;
  "@_level"?: string;
  "@_targetVersion"?: string;
  // 1-based index into the active SkillSet's <Skill> list pointing at the
  // build's primary active skill. PoB also sometimes sets `mainActiveSkill="1"`
  // on the gem itself, but that flag is stale/unreliable across sets — the
  // mainSocketGroup attribute on <Build> is canonical.
  "@_mainSocketGroup"?: string;
}

interface PobRoot {
  Build?: PobBuildBlock;
  Tree?: { Spec?: PobSpec[] };
  Items?: { Item?: PobItem[]; ItemSet?: PobItemSet[] };
  Skills?: { SkillSet?: PobSkillSet[] };
  Config?: { Input?: PobConfigInput[] };
}

export interface ConvertWarning {
  level: "info" | "warn";
  message: string;
}

export interface ConvertedBuild {
  build: BuildInput;
  warnings: ConvertWarning[];
  // Reference: parsed item bodies retained so callers (e.g., ingest) can
  // inspect implicits/sockets etc. without re-parsing.
  parsed_items: Map<string, ParsedPobItem>;
}

export function xmlToBuildInput(
  root: PobXmlRoot,
  patchVersion = "0.4",
): ConvertedBuild {
  const r = (root.PathOfBuilding2 ?? root.PathOfBuilding) as
    | PobRoot
    | undefined;
  if (!r) {
    throw new Error("xmlToBuildInput: missing <PathOfBuilding2> root");
  }

  const warnings: ConvertWarning[] = [];
  const header = extractBuildHeader(root);

  const passives = parsePassives(r);
  const { items, parsed_items } = parseItems(r, warnings);
  const mainSocketGroup = parseInt(r.Build?.["@_mainSocketGroup"] ?? "0", 10);
  const skills = parseSkills(r, warnings, mainSocketGroup);
  const assumptions = parseAssumptions(r);
  const quest_rewards = extractQuestRewardTexts(root);

  const build: BuildInput = {
    patch_version: patchVersion,
    character_class: header.className ?? "",
    ascendancy: header.ascendancy ?? null,
    level: header.level ?? 1,
    passives,
    items,
    skills,
    assumptions,
    quest_rewards,
  };

  return { build, warnings, parsed_items };
}

function parsePassives(r: PobRoot): PassiveNode[] {
  const spec = r.Tree?.Spec?.[0];
  const csv = spec?.["@_nodes"];
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((node_id) => ({ node_id }));
}

function parseItems(
  r: PobRoot,
  warnings: ConvertWarning[],
): { items: BuildItem[]; parsed_items: Map<string, ParsedPobItem> } {
  const itemNodes = r.Items?.Item ?? [];
  const parsed_items = new Map<string, ParsedPobItem>();

  for (const node of itemNodes) {
    const id = node["@_id"];
    const text = (node["#text"] ?? "").toString();
    if (!id || !text.trim()) continue;
    try {
      parsed_items.set(id, parsePobItemText(text));
    } catch (err) {
      warnings.push({
        level: "warn",
        message: `parseItems: failed on item id=${id}: ${(err as Error).message}`,
      });
    }
  }

  // The active ItemSet's Slot list tells us which item id belongs in which
  // slot. We pick the first ItemSet (extending later if PoB exports multiple).
  const itemSet = r.Items?.ItemSet?.[0];
  const items: BuildItem[] = [];
  for (const slot of itemSet?.Slot ?? []) {
    const slotName = slot["@_name"];
    const itemId = slot["@_itemId"];
    if (!slotName || !itemId) continue;
    // PoB writes itemId="0" for unequipped slots (e.g., empty weapon swap).
    if (itemId === "0") continue;
    const mapped = mapPobSlot(slotName);
    if (!mapped) continue; // Flask, charm slots, weapon swap labels we don't model yet.
    const parsed = parsed_items.get(itemId);
    if (!parsed) {
      warnings.push({
        level: "warn",
        message: `parseItems: slot ${slotName} references missing item id=${itemId}`,
      });
      continue;
    }
    items.push(pobItemToBuildItem(parsed, mapped));
  }
  return { items, parsed_items };
}

function parseSkills(
  r: PobRoot,
  warnings: ConvertWarning[],
  mainSocketGroup: number,
): BuildSkill[] {
  const skillSet = r.Skills?.SkillSet?.[0];
  const skillList = skillSet?.Skill ?? [];
  const out: BuildSkill[] = [];
  // mainSocketGroup is 1-based and counts ALL <Skill> groups (including
  // disabled ones) before filtering. We track the original index so the
  // build's primary skill gets role="main" exactly once.
  for (let groupIdx = 0; groupIdx < skillList.length; groupIdx++) {
    const skill = skillList[groupIdx]!;
    if (skill["@_enabled"] === "false") continue;
    const gems = skill.Gem ?? [];
    if (gems.length === 0) continue;
    // First non-support gem is the active skill of this group; remaining
    // gems become its supports. PoB doesn't always sort active-first, so we
    // identify via skillId not containing "Support".
    const main = gems.find(
      (g) => !(g["@_skillId"] ?? "").startsWith("Support") && g["@_enabled"] !== "false",
    );
    if (!main) continue;

    const supports: SupportGem[] = [];
    for (const g of gems) {
      if (g === main) continue;
      if (g["@_enabled"] === "false") continue;
      const sid = g["@_skillId"];
      if (!sid) continue;
      supports.push({
        support_id: sid,
        level: parseInt(g["@_level"] ?? "1", 10),
        quality: parseInt(g["@_quality"] ?? "0", 10),
      });
    }

    const isMainGroup = mainSocketGroup > 0 && groupIdx + 1 === mainSocketGroup;
    const role: SkillRole = isMainGroup ? "main" : "secondary";
    const linkCount = 1 + supports.length;

    out.push({
      skill_id: main["@_skillId"]!,
      level: parseInt(main["@_level"] ?? "1", 10),
      quality: parseInt(main["@_quality"] ?? "0", 10),
      role,
      supports,
      links: linkCount,
    });
  }
  if (out.length === 0) {
    warnings.push({
      level: "warn",
      message: "parseSkills: no enabled skills found in active SkillSet",
    });
  }
  return out;
}

function parseAssumptions(r: PobRoot): CalcAssumptions {
  const inputs = r.Config?.Input ?? [];
  const byName = new Map<string, PobConfigInput>();
  for (const inp of inputs) {
    const n = inp["@_name"];
    if (n) byName.set(n, inp);
  }

  const flag = (name: string) =>
    byName.get(name)?.["@_boolean"] === "true" ||
    byName.get(name)?.["@_string"] === "true";
  const num = (name: string) =>
    Number.parseInt(byName.get(name)?.["@_number"] ?? "0", 10) || 0;

  const enemyType = mapEnemyType(byName.get("enemyIsBoss")?.["@_string"]);

  return {
    ...DEFAULT_ASSUMPTIONS,
    frenzy_charges: num("useFrenzyCharges") ? 3 : 0, // PoB uses booleans for max charges.
    power_charges: num("usePowerCharges") ? 3 : 0,
    endurance_charges: num("useEnduranceCharges") ? 3 : 0,
    flasks_active: flag("conditionFlaskActive") || flag("conditionUsingFlask"),
    onslaught: flag("conditionOnslaught"),
    enemy_type: enemyType,
  };
}

// Quest-reward "string" Config inputs encode passive grants the campaign
// awards (e.g. "+5 to All Attributes", "25% increased Stun Threshold").
// These ride the same code path as item mods — return the raw text bodies
// so the resolver can run them through parseModText().
export function extractQuestRewardTexts(root: PobXmlRoot): string[] {
  const r = (root.PathOfBuilding2 ?? root.PathOfBuilding) as
    | PobRoot
    | undefined;
  if (!r) return [];
  const inputs = r.Config?.Input ?? [];
  const out: string[] = [];
  for (const inp of inputs) {
    const name = inp["@_name"];
    const value = inp["@_string"];
    if (!name || !value) continue;
    if (!name.startsWith("questAct")) continue;
    out.push(value);
  }
  return out;
}

function mapEnemyType(raw: string | undefined): EnemyType {
  if (!raw) return "boss";
  // PoB encodes this as "Pinnacle Boss" / "Boss" / "None" depending on UI.
  if (raw === "None") return "white";
  return "boss";
}
