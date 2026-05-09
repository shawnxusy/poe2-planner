// Combined hit-damage calc.
//
// Pipeline:
//   1. base damage (weapon or Hollow Palm unarmed)
//   2. + flat additions per element (gear, supports, jewels)
//   3. apply skill conversion (e.g. 80% phys → cold) at flat layer
//   4. apply increased + more pools per element
//      - converted-portion gets dual scaling: it picks up source-side
//        increases AND destination-side increases (PoE convention).
//   5. apply skill effectiveness (damage_multiplier — already a MORE
//      entry; pools handle it).
//   6. roll up averages, then apply crit and attack speed for DPS.

import type { BuildInput, DamageType } from "@poe2/types";
import type { GameData } from "../data/types.js";
import type { ModSet } from "../modifiers/types.js";
import { computeAttackSpeed, UNARMED_BASE_ATTACK_RATE } from "./attack-speed.js";
import { computeAttributes } from "./attributes.js";
import {
  HOLLOW_PALM_HASH,
  computeBaseDamage,
  type BaseDamageResult,
} from "./base-damage.js";
import { applyConversion, collectConversion } from "./conversion.js";
import {
  DEFAULT_BASE_CRIT,
  computeCritChance,
  computeCritMultiplier,
} from "./crit.js";
import { flatDamageByElement } from "./flat.js";
import { computeDamagePool } from "./pools.js";
import { ELEMENTS, emptyPerElement, emptyRange, type DamageRange, type HitBreakdown, type PerElement } from "./types.js";

export interface HitInput {
  build: BuildInput;
  game: GameData;
  mods: ModSet;
}

export function computeHit(input: HitInput): HitBreakdown {
  const { build, game, mods } = input;
  const main = build.skills.find((s) => s.role === "main");
  const skillRec = main ? game.skills_by_metadata_id.get(main.skill_id) : undefined;
  const skillTags = skillRec?.tags ?? [];

  // 1. attributes — needed for Hollow Palm scaling.
  const attributes = computeAttributes(build, mods.entries);
  const hollow_palm_active = build.passives.some(
    (p) => Number.parseInt(p.node_id, 10) === HOLLOW_PALM_HASH,
  );

  // 2. base damage.
  const base = computeBaseDamage({ build, attributes, hollow_palm_active });
  const baseRanges = baseToPerElement(base);

  // 3. flat added damage from mods.
  const flatAdded = flatDamageByElement(mods.entries, build.assumptions);

  const flatTotal = sumPerElement(baseRanges, flatAdded);

  // 4. apply skill-baked conversion.
  const conv = collectConversion(mods.entries);
  const { after: postConversion, converted } = applyConversion(flatTotal, conv);

  // 5. increased + more pools per element.
  const pool = computeDamagePool(mods.entries, build.assumptions, {
    skill_tags: skillTags,
  });

  // First, apply destination-side scaling to the after-conversion ranges.
  const afterPools = scalePerElement(postConversion, pool);

  // Then, for each converted portion, layer source-side scaling on top.
  // PoE convention: increased pools from BOTH source and destination are
  // ADDED into a single pool for the converted portion (dual-dipping on
  // additive %). MORE multipliers from both sides apply multiplicatively.
  //
  // Math:
  //   converted_final = portion × (1 + (srcInc + dstInc) / 100) × srcMore × dstMore
  //
  // We've already counted the destination-only contribution to afterPools
  // when scalePerElement ran. Replace it with the dual-scaled value.
  for (const c of converted) {
    const srcIncPct = pool.increased[c.from];
    const dstIncPct = pool.increased[c.to];
    const srcMore = pool.more[c.from];
    const dstMore = pool.more[c.to];

    const destOnlyFactor = (1 + dstIncPct / 100) * dstMore;
    const dualFactor = (1 + (srcIncPct + dstIncPct) / 100) * srcMore * dstMore;

    afterPools[c.to].min += c.range.min * (dualFactor - destOnlyFactor);
    afterPools[c.to].max += c.range.max * (dualFactor - destOnlyFactor);
  }

  // 6. roll up.
  const avgPerElement: PerElement<number> = emptyPerElement(() => 0);
  for (const e of ELEMENTS) {
    avgPerElement[e] = (afterPools[e].min + afterPools[e].max) / 2;
  }
  const average_non_crit = ELEMENTS.reduce((acc, e) => acc + avgPerElement[e], 0);

  // Crit.
  const crit_chance = computeCritChance(DEFAULT_BASE_CRIT, mods.entries, build.assumptions);
  const crit_multiplier = computeCritMultiplier(mods.entries, build.assumptions);
  const cc = crit_chance / 100;
  const average_hit = average_non_crit * (1 + cc * (crit_multiplier - 1));

  // Speed.
  const attack_speed = computeAttackSpeed(
    UNARMED_BASE_ATTACK_RATE,
    mods.entries,
    build.assumptions,
  );

  // For Phase 4 we assume 100% hit chance (accuracy not yet modeled).
  const hit_chance = 1;

  const combined_dps = average_hit * attack_speed * hit_chance;

  return {
    per_element: afterPools,
    average_non_crit,
    crit_chance: cc,
    crit_multiplier,
    average_hit,
    attack_speed,
    combined_dps,
    hit_chance,
    layers: {
      base: baseRanges,
      after_flat: flatTotal,
      after_conversion: postConversion,
      after_increased: scaleIncreasedOnly(postConversion, pool),
      after_more: afterPools,
      increased_pct: pool.increased,
      more_factor: pool.more,
    },
  };
}

function baseToPerElement(base: BaseDamageResult): PerElement<DamageRange> {
  return {
    physical: { ...base.physical },
    fire: { ...base.fire },
    cold: { ...base.cold },
    lightning: { ...base.lightning },
    chaos: { ...base.chaos },
  };
}

function sumPerElement(
  a: PerElement<DamageRange>,
  b: PerElement<DamageRange>,
): PerElement<DamageRange> {
  const out = emptyPerElement<DamageRange>(emptyRange);
  for (const e of ELEMENTS) {
    out[e].min = a[e].min + b[e].min;
    out[e].max = a[e].max + b[e].max;
  }
  return out;
}

function scalePerElement(
  ranges: PerElement<DamageRange>,
  pool: { increased: PerElement<number>; more: PerElement<number> },
): PerElement<DamageRange> {
  const out = emptyPerElement<DamageRange>(emptyRange);
  for (const e of ELEMENTS) {
    const incFactor = 1 + pool.increased[e] / 100;
    const moreFactor = pool.more[e];
    out[e].min = ranges[e].min * incFactor * moreFactor;
    out[e].max = ranges[e].max * incFactor * moreFactor;
  }
  return out;
}

function scaleIncreasedOnly(
  ranges: PerElement<DamageRange>,
  pool: { increased: PerElement<number>; more: PerElement<number> },
): PerElement<DamageRange> {
  const out = emptyPerElement<DamageRange>(emptyRange);
  for (const e of ELEMENTS) {
    const incFactor = 1 + pool.increased[e] / 100;
    out[e].min = ranges[e].min * incFactor;
    out[e].max = ranges[e].max * incFactor;
  }
  return out;
}
