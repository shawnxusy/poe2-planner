// BuildInput + GameData → ModSet.
//
// The resolver walks every modifier source in a build and emits typed
// ModEntries. After this point, calc paths read ONLY the ModSet — they
// don't re-walk passive nodes, items, or supports. That separation keeps
// the calculation deterministic and lets us audit drift by inspecting
// the resolved ModSet alone.
//
// Sources walked, in order:
//   1. Passives (by hash) — stat IDs from RePoE map directly via stat-mapping.ts
//   2. Items — implicits + affixes parsed via parseModText (we already
//      have the text body and PoB tags from the item-text parser).
//   3. Supports — stub for now; will expand with per-support modifier
//      ingestion in a follow-up.
//
// Each entry carries a ModSource pointing back to the producing node/item.

import type { BuildInput, BuildItem, ItemAffix } from "@poe2/types";
import type { GameData } from "../data/types.js";
import { categorize } from "./categorize.js";
import { chargeMods } from "./charges.js";
import { hollowPalmMods } from "./hollow-palm.js";
import { parseModText } from "./parser.js";
import { rageMods } from "./rage.js";
import { skillBaseMods, supportMods } from "./skill-base.js";
import { statToMods } from "./stat-mapping.js";
import type { ModEntry, ModSet, ModSource } from "./types.js";
import { emptyModSet } from "./types.js";

export interface ResolveResult {
  mods: ModSet;
  // Stats from passives we couldn't map. Useful for drift audits.
  unresolved_passive_stats: Array<{ stat_id: string; value: number; node: string }>;
  // Item mod text lines that fell into UNKNOWN. Same purpose.
  unresolved_item_text: Array<{ text: string; slot: string }>;
  // Passive hashes referenced by the build but not present in GameData.
  missing_passives: number[];
}

export function resolve(build: BuildInput, game: GameData): ResolveResult {
  const set = emptyModSet();
  const unresolved_passive_stats: ResolveResult["unresolved_passive_stats"] = [];
  const unresolved_item_text: ResolveResult["unresolved_item_text"] = [];
  const missing_passives: number[] = [];

  resolvePassives(build, game, set, unresolved_passive_stats, missing_passives);
  resolveItems(build, set, unresolved_item_text);
  resolveQuestRewards(build, set);
  resolveMainSkill(build, game, set);
  for (const m of chargeMods(build.assumptions)) set.entries.push(m);
  for (const m of rageMods(build.assumptions)) set.entries.push(m);
  for (const m of hollowPalmMods(build)) set.entries.push(m);

  // Categorize once at the end so resolver-side authors don't need to
  // remember the scope rules. Returns a fresh array, so we re-attach.
  set.entries = categorize(set.entries);

  return { mods: set, unresolved_passive_stats, unresolved_item_text, missing_passives };
}

function resolveQuestRewards(build: BuildInput, set: ModSet): void {
  const texts = build.quest_rewards ?? [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    const source: ModSource = { kind: "config", ref: `quest_reward#${i}` };
    const entries = parseModText(text, source);
    for (const e of entries) set.entries.push(e);
  }
}

function resolveMainSkill(build: BuildInput, game: GameData, set: ModSet): void {
  const main = build.skills.find((s) => s.role === "main");
  if (!main) return;
  const rec = game.skills_by_metadata_id.get(main.skill_id);
  if (!rec || !rec.raw) return;
  const mods = skillBaseMods(main, { metadata_id: rec.metadata_id, raw: rec.raw });
  for (const m of mods) set.entries.push(m);

  const supports = supportMods(main, main.supports, (id) => {
    const r = game.skills_by_metadata_id.get(id);
    if (!r || !r.raw) return undefined;
    return { metadata_id: r.metadata_id, raw: r.raw };
  });
  for (const m of supports) set.entries.push(m);
}

function resolvePassives(
  build: BuildInput,
  game: GameData,
  set: ModSet,
  unresolved: ResolveResult["unresolved_passive_stats"],
  missing: number[],
): void {
  for (const node of build.passives) {
    const hash = Number.parseInt(node.node_id, 10);
    if (!Number.isFinite(hash)) continue;
    const rec = game.passives_by_hash.get(hash);
    if (!rec) {
      missing.push(hash);
      continue;
    }
    const source: ModSource = { kind: "passive", ref: String(hash) };
    for (const stat_id of rec.stat_ids) {
      const value = rec.stats_values[stat_id] ?? 0;
      if (value === 0) continue;
      const mods = statToMods(stat_id, value, source);
      if (mods === null) {
        unresolved.push({ stat_id, value, node: rec.name });
        continue;
      }
      for (const m of mods) set.entries.push(m);
    }
  }
}

function resolveItems(
  build: BuildInput,
  set: ModSet,
  unresolved: ResolveResult["unresolved_item_text"],
): void {
  for (const item of build.items) {
    pushItemAffixes(item, item.implicits, "implicit", set, unresolved);
    pushItemAffixes(item, item.affixes, "explicit", set, unresolved);
  }
}

function pushItemAffixes(
  item: BuildItem,
  affixes: ItemAffix[],
  kind: "implicit" | "explicit",
  set: ModSet,
  unresolved: ResolveResult["unresolved_item_text"],
): void {
  for (let idx = 0; idx < affixes.length; idx++) {
    const affix = affixes[idx]!;
    if (!affix.text || affix.text.length === 0) continue;
    const source: ModSource = {
      kind,
      ref: `${item.slot}#${kind === "implicit" ? "i" : "e"}${idx}`,
    };
    const entries = parseModText(affix.text, source);
    for (const e of entries) {
      // If parser fell back to UNKNOWN, log to unresolved bucket. We still
      // push the entry so downstream telemetry can count it.
      if (e.operator === "UNKNOWN") {
        unresolved.push({ text: affix.text, slot: item.slot });
      }
      set.entries.push(e);
    }
  }
}

// Coverage helper: how many entries did we resolve vs. how many were
// UNKNOWN/missing? Useful for fixture-driven smoke tests.
export function coverageReport(r: ResolveResult): {
  total: number;
  unknown: number;
  unresolved_passive_stats: number;
  unresolved_item_text: number;
  missing_passives: number;
  pct_resolved: number;
} {
  const total = r.mods.entries.length;
  const unknown = r.mods.entries.filter((e: ModEntry) => e.operator === "UNKNOWN").length;
  const resolved = total - unknown;
  const pct_resolved = total === 0 ? 0 : resolved / total;
  return {
    total,
    unknown,
    unresolved_passive_stats: r.unresolved_passive_stats.length,
    unresolved_item_text: r.unresolved_item_text.length,
    missing_passives: r.missing_passives.length,
    pct_resolved,
  };
}
