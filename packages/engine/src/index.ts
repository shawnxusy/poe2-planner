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
