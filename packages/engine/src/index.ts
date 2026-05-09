// Engine entrypoint. Phase 4 hit-damage + defense paths land here:
//   pob/codec.ts          PoB share-code en/decode
//   pob/xml.ts            XML → JS object
//   pob/build-input.ts    XML → BuildInput (passives, items, skills, conf)
//   modifiers/*           Resolver, parser, categorise, conditions
//   damage/*              Hit + crit + speed + DPS pipeline
//   defense/*             Life/ES/armour/evasion/resistances/EHP
//   calculate.ts          Top-level calculate(build, { game }) → CalcResult

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

// Modifier system
export {
  parseModText,
} from "./modifiers/parser.js";
export {
  categorize,
  selectMods,
} from "./modifiers/categorize.js";
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

// Resolver (still useful for AI build construction + parsing)
export { resolve } from "./modifiers/resolver.js";
export type { ResolveResult } from "./modifiers/resolver.js";

// Experimental in-process calc (approximate, fast — see calibration memo)
export { computeHit } from "./damage/hit.js";
export { computeDefense } from "./defense/index.js";

// Authoritative PoB headless backend (default)
export { PobBridge } from "./pob-bridge/index.js";
export type { BridgeOptions } from "./pob-bridge/index.js";

// Top-level entrypoint — defaults to PoB backend
export { calculate } from "./calculate.js";
export type { CalculateOptions } from "./calculate.js";
