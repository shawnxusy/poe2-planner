// Engine entrypoint.
//
//   pob/codec.ts          PoB share-code en/decode
//   pob/xml.ts            XML → JS object
//   pob/build-input.ts    XML → BuildInput (passives, items, skills, conf)
//   pob/player-stats.ts   Extract embedded <PlayerStat> values
//   pob/item-text.ts      PoB item-body text parser
//   modifiers/*           Resolver, parser, categorise, conditions
//                         (build inspection + future BuildInput → PoB XML;
//                         NOT used to compute final stats — PoB does that)
//   pob-bridge/           Subprocess wrapper around PoB-PoE2 headless;
//                         the single source of truth for damage/defense.
//   calculate.ts          calculate(build, { pobXml }) → CalcResult

export { decodePobCode, encodePobCode } from "./pob/codec.js";
export { parsePobXml, type PobXmlRoot } from "./pob/xml.js";
export {
  derivedStats,
  extractBuildHeader,
  extractPlayerStats,
  type DerivedBuildStats,
  type PlayerStats,
  type PobBuildHeader,
} from "./pob/player-stats.js";
export {
  parsePobItemText,
  mapPobSlot,
  pobItemToBuildItem,
  type ParsedPobItem,
} from "./pob/item-text.js";
export {
  xmlToBuildInput,
  type ConvertedBuild,
  type ConvertWarning,
} from "./pob/build-input.js";

// Modifier system — used for inspection / scoring heuristics; not the
// damage pipeline. See pob-bridge for authoritative stats.
export { parseModText } from "./modifiers/parser.js";
export { categorize, selectMods } from "./modifiers/categorize.js";
export { resolve } from "./modifiers/resolver.js";
export type { ResolveResult } from "./modifiers/resolver.js";
export type {
  ModEntry,
  ModOperator,
  ModScope,
  ModSet,
  ModSource,
  ModTarget,
} from "./modifiers/types.js";
export { emptyModSet, pushMod } from "./modifiers/types.js";

// Game data loader (DB → in-memory snapshot)
export { loadGameData } from "./data/load.js";
export type {
  GameData,
  ModRecord,
  PassiveRecord,
  SkillRecord,
} from "./data/types.js";

// Authoritative calc backend
export { PobBridge } from "./pob-bridge/index.js";
export type { BridgeOptions } from "./pob-bridge/index.js";

// Top-level entrypoint
export { calculate } from "./calculate.js";
export type { CalculateOptions } from "./calculate.js";
