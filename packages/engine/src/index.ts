// Engine entrypoint. Phase 4 work in progress — calculate() is not yet
// wired through. The pieces are landing one at a time:
//   pob/codec.ts — decode/encode PoB share codes (DONE)
//   pob/xml.ts — XML → JS object (DONE)
//   pob/parser.ts — JS object → BuildInput (TODO once we have a fixture)
//   modifiers/*  — categorize, aggregate, resolve (TODO)
//   damage/*     — hit, ignite, bleed, poison, cast-on-x, minion (TODO)
//   defense/*    — armour, evasion, resistance, ehp (TODO)

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
