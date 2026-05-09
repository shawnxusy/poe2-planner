// Mod text → structured ModEntry parser.
//
// PoB has 100+ regex patterns to handle every mod variant. We start with the
// patterns that cover the bulk of hit-based attack builds — flat additions,
// increased/more/reduced/less, crit, speed, life/ES, resistances — and
// expand from there. Unmatched mods become operator: "UNKNOWN" with the
// raw text preserved, so downstream code can log drift sources without
// crashing.
//
// One `parseModText(line)` call may produce zero, one, or several entries
// (e.g., "Adds 13 to 32 Physical Damage to Attacks" is a single FLAT_RANGE;
// "+(10-20) to all Elemental Resistances" expands to three FLATs).

import type { ModEntry, ModOperator, ModSource, ModTarget } from "./types.js";

interface ParseContext {
  text: string;
  tags: string[];
  source: ModSource;
}

// Internal: builds a partial ModEntry without the engine-assigned `scope`.
// The categorizer fills `scope` later based on tags + target.
type Partial = Omit<ModEntry, "scope">;

// ---- Target resolution -----------------------------------------------------

// Order matters: longer/more specific phrases first so "all elemental
// resistances" wins over "all resistances", "fire damage" over "damage", etc.
const TARGET_PATTERNS: Array<[RegExp, ModTarget]> = [
  // Skill-level grants — must come BEFORE attribute matchers so
  // "to Level of all Melee Skills" doesn't match "all attributes".
  [/level\s+of\s+all\s+melee\s+skills/i, "level_of_melee_skills"],
  [/level\s+of\s+all\s+projectile\s+skills/i, "level_of_projectile_skills"],
  [/level\s+of\s+all\s+spell\s+skills/i, "level_of_spell_skills"],
  [/level\s+of\s+all\s+minion\s+skills/i, "level_of_minion_skills"],
  [/level\s+of\s+all\s+skills/i, "level_of_all_skills"],

  // Resistances
  [/all\s+elemental\s+resistances?/i, "all_elemental_resistance"],
  [/all\s+resistances?/i, "all_resistance"],
  [/maximum\s+fire\s+resistance/i, "max_fire_resistance"],
  [/maximum\s+cold\s+resistance/i, "max_cold_resistance"],
  [/maximum\s+lightning\s+resistance/i, "max_lightning_resistance"],
  [/maximum\s+chaos\s+resistance/i, "max_chaos_resistance"],
  [/lightning\s+and\s+chaos\s+resistances?/i, "all_resistance"],
  [/fire\s+(and\s+cold\s+)?resistances?/i, "fire_resistance"],
  [/cold\s+resistance/i, "cold_resistance"],
  [/lightning\s+resistance/i, "lightning_resistance"],
  [/chaos\s+resistance/i, "chaos_resistance"],

  // Damage by source/element (specific damage types beat generic "damage")
  [/physical\s+damage/i, "physical_damage"],
  [/fire\s+damage/i, "fire_damage"],
  [/cold\s+damage/i, "cold_damage"],
  [/lightning\s+damage/i, "lightning_damage"],
  [/chaos\s+damage/i, "chaos_damage"],
  [/elemental\s+damage/i, "elemental_damage"],
  [/spell\s+damage/i, "spell_damage"],
  [/attack\s+damage/i, "attack_damage"],
  [/projectile\s+damage/i, "projectile_damage"],
  [/area\s+damage/i, "area_damage"],

  // Speed
  [/attack\s+speed/i, "attack_speed"],
  [/cast\s+speed/i, "cast_speed"],
  [/movement\s+speed/i, "movement_speed"],
  [/skill\s+speed/i, "skill_speed"],

  // Crit
  [/critical\s+(hit|strike)\s+chance/i, "crit_chance"],
  [/critical\s+(damage|hit\s+damage|strike\s+multiplier|damage\s+bonus)/i, "crit_damage"],

  // Defenses — recharge-rate phrases match BEFORE the bare "energy shield"
  // target so "increased Energy Shield Recharge Rate" doesn't fall into
  // the energy_shield bucket.
  [/energy\s+shield\s+recharge\s+rate/i, "energy_shield"], // close-enough; calc paths ignore recharge for now
  [/maximum\s+life/i, "life"],
  [/maximum\s+energy\s+shield/i, "energy_shield"],
  [/maximum\s+mana/i, "mana"],
  [/(?<!attribute\s)spirit\b/i, "spirit"],
  [/^life\s*:/i, "life"],
  [/^energy\s*shield\s*:/i, "energy_shield"],
  [/^mana\s*:/i, "mana"],
  [/armour(?!,)/i, "armour"],
  [/evasion(?:\s+rating)?/i, "evasion"],
  // Bare "energy shield" / "life" / "mana" — last resort defense match.
  // PoE2 item locals like "73% increased Energy Shield" hit here.
  [/energy\s+shield/i, "energy_shield"],
  [/\blife\b/i, "life"],
  [/\bmana\b/i, "mana"],

  // Attributes
  [/all\s+attributes?/i, "all_attributes"],
  [/strength/i, "strength"],
  [/dexterity/i, "dexterity"],
  [/intelligence/i, "intelligence"],

  // Misc
  [/accuracy\s+rating/i, "accuracy_rating"],
  [/stun\s+threshold/i, "stun_threshold"],
  [/rarity\s+of\s+items/i, "rarity_of_items"],
  [/block\s+chance/i, "block_chance"],

  // Ailment-flavored damage targets
  [/magnitude\s+of\s+damaging\s+ailments/i, "ailment_magnitude"],
  [/magnitude\s+of\s+non[- ]damaging\s+ailments/i, "non_damaging_ailment_magnitude"],
  [/duration\s+of\s+elemental\s+ailments/i, "elemental_ailment_duration"],
  [/duration\s+of\s+damaging\s+ailments/i, "ailment_duration"],
  [/duration\s+of\s+ailments/i, "ailment_duration"],
  [/poison\s+(damage|magnitude)/i, "poison_damage"],
  [/ignite\s+damage/i, "ignite_damage"],
  [/bleed(?:ing)?\s+damage/i, "bleed_damage"],

  // PoE2 mechanics
  [/deflection\s+rating/i, "deflection_rating"],
  [/cooldown\s+recovery\s+rate/i, "cooldown_recovery_rate"],
  [/cost\s+efficiency/i, "cost_efficiency"],
  [/projectile\s+speed/i, "projectile_speed"],

  // Generic "damage" — must come last so specific types win.
  [/\bdamage\b/i, "any_damage"],
];

// Map a free-text condition trailer ("if you have not been Hit Recently")
// onto a discrete condition tag the resolver/damage paths can gate on.
// Conditions we don't recognise pass through as the raw lowercase phrase
// so debug tooling can still see them.
function conditionToTag(rawCondition: string): string {
  const c = rawCondition.toLowerCase();
  if (/not\s+been\s+hit\s+recently/.test(c)) return "not_hit_recently";
  if (/full\s+life/.test(c)) return "full_life";
  if (/low\s+life/.test(c)) return "low_life";
  if (/frozen/.test(c)) return "vs_frozen";
  if (/shocked/.test(c)) return "enemy_shocked";
  if (/chilled/.test(c)) return "enemy_chilled";
  return c.replace(/\s+/g, "_");
}

function resolveTarget(text: string): ModTarget | null {
  for (const [re, target] of TARGET_PATTERNS) {
    if (re.test(text)) return target;
  }
  return null;
}

// ---- Range parsing ---------------------------------------------------------

// "(5-8)" → 8 (high end), since rolled affixes commit to a value but PoB
// emits the range when the item isn't yet rolled. Consumers should override
// from raw item values when they have them.
const RANGE_RE = /\((-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)/;

function pickValueFromText(text: string): number | null {
  // Prefer first plain number; if a (lo-hi) range is present and no plain
  // number precedes it, take the high end.
  const range = text.match(RANGE_RE);
  if (range) {
    const hi = Number.parseFloat(range[2]!);
    if (Number.isFinite(hi)) return hi;
  }
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

// ---- Pattern handlers ------------------------------------------------------

// Each handler tries to recognise a shape and emits zero or more partials.
// Order matters: more specific patterns first.
type Handler = (ctx: ParseContext) => Partial[] | null;

const HANDLERS: Handler[] = [
  // "Bonded: <inner mod>" — PoE2 mechanic where some affixes only apply
  // when "bonded" (e.g., a runeword condition). Strip the prefix and
  // recurse on the inner text. We treat the bonded result as conditional
  // by tagging "bonded" so the resolver can later gate it on bond state.
  (ctx) => {
    const m = ctx.text.match(/^Bonded:\s*(.+)$/i);
    if (!m) return null;
    const innerCtx: ParseContext = {
      text: m[1]!,
      tags: [...ctx.tags, "bonded"],
      source: ctx.source,
    };
    for (const h of HANDLERS) {
      if (h === HANDLERS[0]) continue; // skip self
      const out = h(innerCtx);
      if (out && out.length > 0) return out;
    }
    return null;
  },

  // "<Stat> is doubled" / "<Stat> is tripled" — PoE2 has these as MORE
  // multipliers on certain unique-style mods. The full text often has a
  // condition trailer ("if you have not been Hit Recently"); we strip the
  // condition into a tag so the resolver can gate it appropriately.
  (ctx) => {
    const m = ctx.text.match(
      /^(.+?)\s+is\s+(doubled|tripled|quadrupled)(?:\s+(if|while|when)\s+(.+))?$/i,
    );
    if (!m) return null;
    const stat = m[1]!.trim();
    const factor = m[2]!.toLowerCase();
    const condition = m[4]?.toLowerCase();
    const target = resolveTarget(stat);
    if (!target) return null;
    const value = factor === "doubled" ? 100 : factor === "tripled" ? 200 : 300;
    const tags = [...ctx.tags];
    if (condition) tags.push("conditional", conditionToTag(condition));
    return [
      {
        operator: "MORE" as ModOperator,
        target,
        value,
        tags,
        source_text: ctx.text,
        source: ctx.source,
      },
    ];
  },

  // "+N to Level of all <Type> Skills" — skill level grants.
  (ctx) => {
    const m = ctx.text.match(
      /^([+-]?\d+(?:\.\d+)?)\s+to\s+Level\s+of\s+all\s+(Melee|Projectile|Spell|Minion)?\s*Skills?/i,
    );
    if (!m) return null;
    const value = Number.parseFloat(m[1]!);
    const kind = (m[2] ?? "").toLowerCase();
    const target =
      kind === "melee" ? "level_of_melee_skills" :
      kind === "projectile" ? "level_of_projectile_skills" :
      kind === "spell" ? "level_of_spell_skills" :
      kind === "minion" ? "level_of_minion_skills" :
      "level_of_all_skills";
    return [{
      operator: "FLAT" as ModOperator,
      target: target as ModTarget,
      value,
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },

  // "X% chance to <Effect> on Hit" / "on Critical Hit"
  (ctx) => {
    const m = ctx.text.match(
      /^(\d+(?:\.\d+)?)%\s+chance\s+to\s+(Poison|Ignite|Bleed|Freeze|Shock|Chill|Electrocute)(?:\s+(on\s+Hit|on\s+Critical\s+Hit|on\s+Hit\s+with\s+\w+))?/i,
    );
    if (!m) return null;
    const eff = m[2]!.toLowerCase();
    const target =
      eff === "poison" ? "chance_to_poison_on_hit" :
      eff === "ignite" ? "chance_to_ignite_on_hit" :
      eff === "bleed" ? "chance_to_bleed_on_hit" :
      eff === "freeze" ? "chance_to_freeze" :
      "chance_to_shock";
    return [{
      operator: "CHANCE" as ModOperator,
      target: target as ModTarget,
      value: Number.parseFloat(m[1]!),
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },

  // Triggered effects: "When you …", "On <event>, …".
  (ctx) => {
    const m = ctx.text.match(/^(When\s+you|On\s+(?:Hit|Kill|Crit|Block))\b/i);
    if (!m) return null;
    return [{
      operator: "TRIGGER" as ModOperator,
      target: "any_damage" as ModTarget,
      value: 0,
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },

  // "Adds N to M Z damage [to Attacks/Spells]"
  (ctx) => {
    const m = ctx.text.match(
      /^Adds\s+(?:\((-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)|(-?\d+(?:\.\d+)?))\s+to\s+(?:\((-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\)|(-?\d+(?:\.\d+)?))\s+(physical|fire|cold|lightning|chaos)\s+damage/i,
    );
    if (!m) return null;
    // For "Adds A to B X damage" the rolled item commits to fixed numbers, so
    // a single capture wins (m[3]/m[6]). For unrolled (lo-hi) ranges we take
    // the high end as a sensible upper bound — same convention PoB uses for
    // reading template item bases.
    const lo = Number.parseFloat(m[2] ?? m[3]!);
    const hi = Number.parseFloat(m[5] ?? m[6]!);
    const elem = m[7]!.toLowerCase();
    const target =
      elem === "physical" ? "physical_damage" :
      elem === "fire" ? "fire_damage" :
      elem === "cold" ? "cold_damage" :
      elem === "lightning" ? "lightning_damage" :
      "chaos_damage";
    return [
      {
        operator: "FLAT_RANGE" as ModOperator,
        target: target as ModTarget,
        value: lo,
        value_high: hi,
        tags: ctx.tags,
        source_text: ctx.text,
        source: ctx.source,
      },
    ];
  },

  // "+N to maximum Life" / "+N% to Cold Resistance" / "-N to Z"
  (ctx) => {
    const m = ctx.text.match(/^([+-]?(?:\(-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?))%?\s+to\s+(.+)$/i);
    if (!m) return null;
    const valStr = m[1]!;
    const tail = m[2]!;
    const target = resolveTarget(tail);
    if (!target) return null;
    const value = pickValueFromText(valStr);
    if (value === null) return null;
    return [{
      operator: "FLAT" as ModOperator,
      target,
      value,
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },

  // "Life: N" / "Energy Shield: N" / "Evasion: N" / "Armour: N" — local
  // base values on item bodies.
  (ctx) => {
    const m = ctx.text.match(/^(Life|Energy\s+Shield|Evasion|Armour|Mana)\s*:\s*(-?\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const stat = m[1]!.toLowerCase().replace(/\s+/g, "_");
    const target =
      stat === "life" ? "life" :
      stat === "energy_shield" ? "energy_shield" :
      stat === "evasion" ? "evasion" :
      stat === "armour" ? "armour" :
      "mana";
    return [{
      operator: "FLAT" as ModOperator,
      target: target as ModTarget,
      value: Number.parseFloat(m[2]!),
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },

  // "X% increased Y" / "X% reduced Y" / "X% more Y" / "X% less Y"
  (ctx) => {
    const m = ctx.text.match(
      /(\(-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)%\s+(increased|reduced|more|less)\s+(.+)$/i,
    );
    if (!m) return null;
    const valStr = m[1]!;
    const opWord = m[2]!.toLowerCase();
    const tail = m[3]!;
    const target = resolveTarget(tail);
    if (!target) return null;
    const value = pickValueFromText(valStr);
    if (value === null) return null;
    const operator: ModOperator =
      opWord === "increased" ? "INCREASED" :
      opWord === "reduced" ? "REDUCED" :
      opWord === "more" ? "MORE" : "LESS";
    return [{
      operator,
      target,
      value,
      tags: ctx.tags,
      source_text: ctx.text,
      source: ctx.source,
    }];
  },
];

// Public API. Returns at least one entry per call (UNKNOWN if nothing
// matched), so consumers can always log/aggregate without nulls.
export function parseModText(
  text: string,
  source: ModSource,
  tags: string[] = [],
): ModEntry[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const ctx: ParseContext = { text: trimmed, tags, source };

  for (const handler of HANDLERS) {
    const partials = handler(ctx);
    if (!partials || partials.length === 0) continue;
    return partials.map((p) => ({ ...p, scope: "global" })); // categorizer overrides scope
  }

  return [
    {
      operator: "UNKNOWN",
      target: "any_damage",
      value: 0,
      tags,
      source_text: trimmed,
      source,
      scope: "global",
    },
  ];
}
