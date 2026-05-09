import { XMLParser } from "fast-xml-parser";

// PoB XML uses attributes for most fields and a single child text node for
// some. fast-xml-parser is configured to keep attributes accessible at a
// known key prefix so downstream code can navigate consistently.
//
// Sample shape produced for `<Spec masteryEffects=""><URL>...</URL></Spec>`:
//   { Spec: { "@_masteryEffects": "", URL: "..." } }
const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Keep arrays for these tags even when there's only one child, so iteration
  // code doesn't have to handle the singleton-vs-array dichotomy. This list
  // grows as we discover more multi-child tags in real PoB exports.
  isArray: (name) =>
    [
      "Skill",
      "Gem",
      "Item",
      "ItemSet",
      "Slot",
      "PlayerStat",
      "MinionStat",
      "Input",
      "Spec",
      "Socket",
      "Node",
      "MasteryEffect",
      "Override",
      "SkillSet",
      "WeaponSet1",
      "WeaponSet2",
      "ModRange",
    ].includes(name),
});

export interface PobXmlRoot {
  PathOfBuilding?: Record<string, unknown>;
  [key: string]: unknown;
}

export function parsePobXml(xml: string): PobXmlRoot {
  return PARSER.parse(xml) as PobXmlRoot;
}
