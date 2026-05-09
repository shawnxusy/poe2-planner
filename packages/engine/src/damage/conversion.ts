// Damage conversion (PoE2 model).
//
// Conversion at the FLAT layer: a percentage of one element's flat damage
// is moved into another element. Per PoE rules, the converted portion is
// scaled by the increased/more pools of BOTH the source AND destination
// elements (the famous "double-dip" before PoE2 ailment rules tightened).
//
// To keep that math accurate without re-running the increased/more pool
// twice, we represent conversion as a chain: the "remaining" portion of
// the source element keeps its original increases; the "converted" portion
// gets dual-scaling applied at apply-time. We model that here by emitting
// adjusted per-element layers ahead of the increased/more pass.
//
// For now we collect conversion ratios from mod entries tagged with
// "conversion","from_<src>","to_<dst>" and apply at the FLAT level.
// Source-side increased mods will be re-applied during the increased
// pool pass (the dual-scaling is implemented in hit.ts).

import type { DamageType } from "@poe2/types";
import type { ModEntry } from "../modifiers/types.js";
import type { DamageRange, PerElement } from "./types.js";
import { emptyPerElement, emptyRange } from "./types.js";

export interface ConversionRatios {
  // For each source element, the % converted to each destination element.
  // E.g. ratios.physical.cold = 80 means 80% of physical → cold.
  // Values are in 0–100; the engine clamps per-source totals to 100%.
  ratios: PerElement<PerElement<number>>;
}

export function emptyConversionRatios(): ConversionRatios {
  return {
    ratios: {
      physical: emptyPerElement(() => 0),
      fire: emptyPerElement(() => 0),
      cold: emptyPerElement(() => 0),
      lightning: emptyPerElement(() => 0),
      chaos: emptyPerElement(() => 0),
    },
  };
}

export function collectConversion(mods: ModEntry[]): ConversionRatios {
  const out = emptyConversionRatios();
  for (const m of mods) {
    if (!m.tags.includes("conversion")) continue;
    const fromTag = m.tags.find((t) => t.startsWith("from_"));
    const toTag = m.tags.find((t) => t.startsWith("to_"));
    if (!fromTag || !toTag) continue;
    const src = fromTag.slice(5) as DamageType;
    const dst = toTag.slice(3) as DamageType;
    if (!(src in out.ratios)) continue;
    if (!(dst in out.ratios[src])) continue;
    out.ratios[src][dst] += m.value;
  }
  // Clamp per-source totals to 100%.
  for (const src of Object.keys(out.ratios) as DamageType[]) {
    let total = 0;
    for (const dst of Object.keys(out.ratios[src]) as DamageType[]) {
      total += out.ratios[src][dst];
    }
    if (total > 100) {
      // Scale down proportionally.
      const scale = 100 / total;
      for (const dst of Object.keys(out.ratios[src]) as DamageType[]) {
        out.ratios[src][dst] *= scale;
      }
    }
  }
  return out;
}

// Apply conversion to a per-element flat-damage map, returning the
// post-conversion ranges. Source-side keeps the unconverted remainder;
// destination-side gains the converted amount at the source's flat values.
//
// Note: for full dual-scaling, the consumer should remember the converted
// amount and re-apply source-side increased/more during the increased
// pass. That's tracked separately by hit.ts.
export function applyConversion(
  flat: PerElement<DamageRange>,
  conv: ConversionRatios,
): {
  after: PerElement<DamageRange>;
  // Per-(src,dst) converted ranges, used by hit.ts to apply dual scaling.
  converted: Array<{ from: DamageType; to: DamageType; range: DamageRange }>;
} {
  const after = emptyPerElement<DamageRange>(emptyRange);
  const converted: Array<{ from: DamageType; to: DamageType; range: DamageRange }> = [];

  for (const src of Object.keys(flat) as DamageType[]) {
    const ratios = conv.ratios[src];
    let convertedFraction = 0;
    for (const dst of Object.keys(ratios) as DamageType[]) {
      convertedFraction += ratios[dst];
    }
    convertedFraction = Math.min(convertedFraction, 100);

    const sourceRange = flat[src];
    const remaining: DamageRange = {
      min: sourceRange.min * (1 - convertedFraction / 100),
      max: sourceRange.max * (1 - convertedFraction / 100),
    };
    after[src] = {
      min: after[src].min + remaining.min,
      max: after[src].max + remaining.max,
    };

    for (const dst of Object.keys(ratios) as DamageType[]) {
      const portion = ratios[dst];
      if (portion <= 0) continue;
      const range: DamageRange = {
        min: sourceRange.min * (portion / 100),
        max: sourceRange.max * (portion / 100),
      };
      after[dst] = {
        min: after[dst].min + range.min,
        max: after[dst].max + range.max,
      };
      converted.push({ from: src, to: dst, range });
    }
  }

  return { after, converted };
}
