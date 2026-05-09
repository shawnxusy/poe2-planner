// BuildInput + GameData → ModSet.
//
// Walks every directly-stated modifier source in a build and emits typed
// ModEntries. The resolver is intentionally conservative: it returns ONLY
// what's literally in the build (passives, item mod text, support gem
// stat_sets, skill stat_sets, quest rewards). It does NOT synthesise
// implied effects (charges, rage, keystone-derived bonuses) — those are
// PoB's job. We use the resolver for inspection, scoring heuristics that
// don't need stats, and (eventually) BuildInput → PoB XML serialisation.
//
// For authoritative DPS/EHP, see pob-bridge.

import type { BuildInput, BuildItem, ItemAffix } from "@poe2/types";
import type { GameData } from "../data/types.js";
import { categorize } from "./categorize.js";
import { parseModText } from "./parser.js";
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
    // If the item displays "Evasion: N" / "Armour: N" / "Energy Shield: N"
    // in its body, those values are the FINAL post-local-scale numbers
    // (PoB convention). Any "X% increased Evasion/Armour/ES" mods on the
    // same item are local and already baked in; we must skip them in the
    // global pool to avoid double-counting.
    const localBaked = detectLocalBakedTargets(item);
    // Per-item "first single-target defense increase already taken" tracker
    // — see pushItemAffixes for why.
    const localFirstTaken = new Set<string>();
    pushItemAffixes(item, item.implicits, "implicit", set, unresolved, localBaked, localFirstTaken);
    pushItemAffixes(item, item.affixes, "explicit", set, unresolved, localBaked, localFirstTaken);
  }
}

// Returns the set of defense targets whose INCREASED/REDUCED mods on
// this item are local (already baked into the item's displayed value
// or applying only to the item's own zero base) and should be dropped
// from the global modifier pool.
//
// PoB convention:
//   - On armour-slot items (helmet, body_armour, gloves, boots), every
//     "% increased Armour/Evasion/Energy Shield" mod is local — it
//     modifies the item's own base, not the global total.
//   - The "Armour/Evasion/Energy Shield: N" lines in the item body are
//     the FINAL post-local-scale numbers; we treat those as the FLAT
//     contribution to the global total.
//   - On non-armour slots (amulet, ring, belt, jewel), the same mods are
//     global by convention.
function detectLocalBakedTargets(item: BuildItem): Set<string> {
  const ARMOUR_SLOTS = new Set(["helmet", "body_armour", "gloves", "boots"]);
  if (ARMOUR_SLOTS.has(item.slot)) {
    return new Set(["evasion", "armour", "energy_shield"]);
  }
  return new Set();
}

function pushItemAffixes(
  item: BuildItem,
  affixes: ItemAffix[],
  kind: "implicit" | "explicit",
  set: ModSet,
  unresolved: ResolveResult["unresolved_item_text"],
  localBaked: Set<string>,
  localFirstTaken: Set<string>,
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
      if (e.operator === "UNKNOWN") {
        unresolved.push({ text: affix.text, slot: item.slot });
      }
      // Local mod heuristic on armour-slot items:
      //   - "Armour, Evasion and Energy Shield" combo mods are always
      //     local — already baked into the displayed values.
      //   - The FIRST single-target "% increased Armour|Evasion|ES" mod
      //     with a tier-typical value (≤ 80%) is local. Higher-roll mods
      //     (≥ 100% increased — typically desecrated/special) stay global.
      const LOCAL_TIER_CAP = 80;
      if (
        (e.operator === "INCREASED" || e.operator === "REDUCED") &&
        localBaked.has(e.target)
      ) {
        if (isMultiDefenseLocalText(affix.text)) continue;
        const isSingleTarget = isSingleDefenseText(affix.text);
        if (
          isSingleTarget &&
          Math.abs(e.value) <= LOCAL_TIER_CAP &&
          !localFirstTaken.has(e.target)
        ) {
          localFirstTaken.add(e.target);
          continue;
        }
      }
      set.entries.push(e);
    }
  }
}

function isMultiDefenseLocalText(text: string): boolean {
  // "X% increased Armour, Evasion and Energy Shield" / "Armour and Evasion"
  // / "Evasion and Energy Shield" — combo mods only.
  return /increased\s+(Armour|Evasion(\s+Rating)?|Energy\s+Shield)\s*(?:,|and)/i.test(text);
}

function isSingleDefenseText(text: string): boolean {
  // Plain "X% increased Armour" / "Evasion Rating" / "Energy Shield" —
  // no comma or "and" after the defense keyword.
  return /^[+-]?\d+(?:\.\d+)?%\s+(?:increased|reduced)\s+(Armour|Evasion(\s+Rating)?|Energy\s+Shield)\s*$/i.test(
    text.trim(),
  );
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
