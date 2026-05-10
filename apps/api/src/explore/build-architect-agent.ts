// Build Architect — Claude tool-calling agent for PoE2 build exploration.
//
// Receives a free-text seed ("Voltaxic Rift chaos-to-lightning", "plant minions
// Invoker") and runs an agentic loop that:
//   1. Calls explore_mechanic to ground itself in real game data
//   2. Uses get_ascendancy_options, find_synergistic_skills, find_enabling_uniques
//      to map the synergy space
//   3. Calls check_node_proximity to validate passive tree feasibility (Layer 3)
//   4. Calls validate_build_skeleton before committing to a recommendation
//
// Returns a streaming AsyncIterable of text chunks so the route can SSE them.

import Anthropic from "@anthropic-ai/sdk";
import type {
  Tool,
  MessageParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import {
  exploreMechanic,
  getAscendancyOptions,
  findSynergisticSkills,
  findEnablingUniques,
  findItemMods,
  checkNodeProximity,
  validateBuildSkeleton,
  type SkeletonInput,
} from "./agent-tools.js";

// ── Tool schemas ────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "explore_mechanic",
    description:
      "Search the game database for passives, skills, and unique items related to a mechanic keyword or seed phrase. Use this to ground your reasoning in real data before making recommendations.",
    input_schema: {
      type: "object",
      properties: {
        seed: {
          type: "string",
          description: "A keyword, mechanic name, or short phrase to search for (e.g. 'chaos damage', 'Voltaxic Rift', 'plant skills').",
        },
      },
      required: ["seed"],
    },
  },
  {
    name: "get_ascendancy_options",
    description:
      "Return all notable and keystone nodes for a given ascendancy class. Use this when evaluating whether a specific ascendancy supports the build concept.",
    input_schema: {
      type: "object",
      properties: {
        ascendancy_name: {
          type: "string",
          description: "Exact ascendancy name, e.g. 'Invoker', 'Stormweaver', 'Deadeye', 'Pathfinder'.",
        },
      },
      required: ["ascendancy_name"],
    },
  },
  {
    name: "find_synergistic_skills",
    description:
      "Find active and support skills that match a list of mechanic tags or keywords. Use this to identify which gems fit the build archetype.",
    input_schema: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Mechanic tags or keywords to match against skill names and tag arrays, e.g. ['lightning', 'projectile', 'chaos'].",
        },
      },
      required: ["tags"],
    },
  },
  {
    name: "find_enabling_uniques",
    description:
      "Find unique items whose mod text explicitly enables or strongly enhances a mechanic. Use this to identify build-enabling gear.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to search unique item stat text for, e.g. ['chaos', 'shock', 'plant'].",
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "check_node_proximity",
    description:
      "Check the shortest path (in passive point edges) between two named passive tree nodes. Use this to validate that two nodes you want in the same build are not prohibitively far apart on the tree.",
    input_schema: {
      type: "object",
      properties: {
        node_name_a: {
          type: "string",
          description: "Exact or close name of the first passive tree node.",
        },
        node_name_b: {
          type: "string",
          description: "Exact or close name of the second passive tree node.",
        },
      },
      required: ["node_name_a", "node_name_b"],
    },
  },
  {
    name: "find_item_mods",
    description:
      "Search for explicit item affixes (prefixes/suffixes) available on rare gear or jewels that match a set of keywords. Use this to determine what stat ranges are achievable on rare equipment or to find jewel mods that support a mechanic. Search by semantic tags (e.g. 'fire', 'minion', 'critical', 'life', 'evasion') or by mod name fragments.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Semantic keywords to match against mod names and tag arrays, e.g. ['fire', 'damage'] or ['minion', 'life'].",
        },
        domain: {
          type: "string",
          description: "Mod domain to search. Use 'item' for gear affixes (default), 'misc' for jewel-slot mods.",
          enum: ["item", "misc"],
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "validate_build_skeleton",
    description:
      "Validate a proposed build skeleton for coherence: confirm the main skill exists, ascendancy nodes exist, and key passives are reachable together. Call this once before writing your final recommendation.",
    input_schema: {
      type: "object",
      properties: {
        class_name: { type: "string", description: "Character class (e.g. 'Witch', 'Ranger')." },
        ascendancy: { type: "string", description: "Ascendancy class (e.g. 'Invoker', 'Deadeye')." },
        main_skill: { type: "string", description: "Primary active skill gem name." },
        key_passives: {
          type: "array",
          items: { type: "string" },
          description: "Names of 2–5 notable or keystone passives central to the build.",
        },
        support_skills: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of support gem names.",
        },
      },
      required: ["class_name", "ascendancy", "main_skill", "key_passives"],
    },
  },
];

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Build Architect for Path of Exile 2 (patch 0.4 — Fate of the Vaal).
Your job is to design synergistic, accurate build concepts from a user seed phrase.

## Process

1. Call explore_mechanic with the seed to ground yourself in real game data.
2. Identify the most promising synergy (mechanic + ascendancy + key passives).
3. Use get_ascendancy_options to evaluate 1–2 ascendancy candidates.
4. Use find_synergistic_skills to find the main skill and supports.
5. Use find_item_mods to identify what rare-gear affixes support the build.
6. Use check_node_proximity to verify key passives aren't prohibitively far apart.
7. Call find_enabling_uniques if a build-enabling unique is relevant.
8. Call validate_build_skeleton before writing your final recommendation.

## Output format (after all tool calls)

## Build Concept: [Name]

**Class / Ascendancy:** [Class] → [Ascendancy]
**Investment tier:** [League-start / Mid-game / End-game]
**Core Skill:** [Skill] + [2–3 supports]
**Playstyle:** [1–2 sentences]

### Spirit Budget
- [Skill or persistent effect]: [Spirit cost or estimated cost]
- Total reserved: ~[N] Spirit (achievable by [level/gear milestone])

### Defense Layer
- **Primary defense:** [evasion+blind | armour+block | energy shield | high life pool]
- **Recovery:** [life flask | leech | regeneration | energy shield recharge]

### Key Passives
- [Notable name] — [why it matters]
- (up to 5 entries)

### Gear Priorities
- [Slot]: [rare affix targets OR specific unique name] — [why]
- [Jewels]: [what stats to roll on jewels; mention if The Adorned Diamond path is relevant]
- [Belt]: [note if charm slots are the primary consideration]
- (4–6 slots total)

### Why It Works
[2–3 sentences on the mechanical synergy]

### Caveats
[1–3 honest limitations, trade-offs, or investment gates]

---

## PoE2 0.4 rules — follow these exactly

### Spirit
- Spirit is a SEPARATE resource pool from mana. Persistent skills (auras, heralds, minion limits, triggered skills, totems) RESERVE Spirit, not mana.
- Typical endgame Spirit budgets: ~150 (low investment), ~250 (mid), ~400+ (fully geared).
- Always enumerate the Spirit cost of every persistent skill you recommend and confirm the total fits an achievable budget. If total Spirit cost exceeds ~350 for a non-specialist build, flag this as a hard requirement.
- The Spirit Budget section is MANDATORY in every response.

### Flask slots
- Exactly 2 flask slots: life flask and mana flask. No utility flasks exist in PoE2.
- Do NOT recommend or reference utility flasks (Quicksilver, Granite, etc.) as player flasks.

### Charms
- Utility effects formerly provided by utility flasks are now provided by Charms.
- Maximum 3 charm slots: belt implicit provides 1–2 slots; a quest reward provides 1 more; some unique belts provide more.
- Belt selection is often driven by the number of charm slots it provides.
- Ailment immunity charms (freeze/chill, shock, ignite, bleed) are near-mandatory for endgame content. Always mention 1–2 critical charm choices in Gear Priorities.

### Support gem uniqueness
- Each support gem type can only be socketed ONCE per character across ALL skill links.
- Example: you cannot use Magnify Support in both your main link and a secondary link simultaneously.
- Do NOT recommend the same support gem in multiple link groups.

### Defense layer (mandatory)
- Every build must have one explicit primary defense layer AND one recovery mechanic.
- The Defense Layer section is MANDATORY. Do not omit it.

### Passive points
- ~99 leveling + ~24 quest rewards + up to 48 Weapon Specialization (24 per weapon set) + 8 ascendancy = ~170 total.
- Weapon Specialization points are weapon-set-specific. Keystones and jewel sockets are always shared between sets.
- There are NO Masteries in PoE2 — do not reference PoE1-style mastery nodes.

### Ascendancy
- 8 ascendancy nodes total per character (2 refund points aside). Choose wisely.
- Tactician (Mercenary) bonuses apply ONLY with magic or normal rarity shields/quivers.
- Arbalist (Mercenary) has similar rarity-gated bonuses. For these ascendancies, never recommend rare items in the affected slot.

### Jewels
- 12 jewel sockets on the passive tree at 0.4. Jewels are a full stat layer — always list them in Gear Priorities.
- The Adorned Diamond is an S-tier unique jewel that converts all socketed jewels to magic rarity. Builds centred on it route aggressively to jewel sockets rather than notables — this changes the entire tree pathing strategy.
- Grand Spectrum × 3 (three specific jewels) can provide 162% elemental resistance, freeing nearly all gear resistance suffixes for offensive stats.
- Cluster Jewels exist in PoE2 but are far less meta-defining than in PoE1.
- Timeless Jewels and Thread of Hope DO NOT EXIST in PoE2 0.4.

### Augments and Soul Cores
- Runes were renamed to Augments in 0.4. They socket into weapons and armour for bonus stats.
- Caster weapons (wands, staves) and jewellery (rings, amulets) have ZERO sockets — do not suggest Augments for these.
- Soul Cores drop exclusively from Trials of Chaos. Charge-doubling Soul Cores are build-enabling for charge-stacking builds.

### Gear rarity
- Most builds aim for rare gear in the endgame. Uniques fill specific enabling slots.
- Always call find_item_mods to verify what rare affixes are achievable for key slots.

### Investment tiers
- League-start: self-found gear, no specific uniques required, accessible passive path.
- Mid-game: a few key unique items, moderate passive investment.
- End-game: BiS unique itemisation, extensive passive tree optimisation, specific jewel setups.
- Always state which tier your recommendation targets.

### Strict PoE1 prohibition
The following do NOT exist in PoE2 0.4 and must never appear in recommendations:
- 6-link sockets (PoE2 uses a different gem socketing system)
- Timeless Jewels (Glorious Vanity, Elegant Hubris, etc.)
- Thread of Hope
- Utility flasks (Quicksilver, Granite, Basalt, etc.)
- Mana reservation (it is Spirit reservation in PoE2)
- Masteries on the passive tree
- Vaal skills / Vaal Orb corruption benefits
- Harvest crafting
- Betrayal / Syndicate
- Eternal Labyrinth / Uber Labyrinth
- Sextants, Scarabs (PoE1 versions)
- PoE1 league mechanics (Delve, Betrayal, etc.)`;


// ── Token pricing ────────────────────────────────────────────────────────────
// claude-opus-4-7 — verify at https://www.anthropic.com/pricing
const PRICE_INPUT_PER_M  = 15.00; // USD per 1M input tokens
const PRICE_OUTPUT_PER_M = 75.00; // USD per 1M output tokens

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  iterations: number;
  estimated_cost_usd: number;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "usage"; usage: UsageSummary };

// ── Agent runner ────────────────────────────────────────────────────────────

export interface ExploreOptions {
  seed: string;
  patchVersionId: number;
  maxIterations?: number;
}

export async function* runBuildArchitect(
  opts: ExploreOptions,
): AsyncGenerator<AgentEvent> {
  const { seed, patchVersionId, maxIterations = 12 } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const messages: MessageParam[] = [
    { role: "user", content: `Design a build concept for: "${seed}"` },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  let totalToolCalls = 0;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    iterations++;
    totalInput  += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Append assistant turn
    messages.push({ role: "assistant", content: response.content });

    // Stream any text blocks
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        yield { type: "text", text: block.text };
      }
    }

    // If no tool calls, we're done
    if (response.stop_reason !== "tool_use") {
      break;
    }

    // Execute tool calls
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      totalToolCalls++;
      let result: unknown;
      try {
        result = await dispatchTool(block.name, block.input as Record<string, unknown>, patchVersionId);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  const estimated_cost_usd =
    (totalInput  / 1_000_000) * PRICE_INPUT_PER_M +
    (totalOutput / 1_000_000) * PRICE_OUTPUT_PER_M;

  yield {
    type: "usage",
    usage: { input_tokens: totalInput, output_tokens: totalOutput, tool_calls: totalToolCalls, iterations, estimated_cost_usd },
  };
}

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  patchVersionId: number,
): Promise<unknown> {
  switch (name) {
    case "explore_mechanic":
      return exploreMechanic(input.seed as string, patchVersionId);

    case "get_ascendancy_options":
      return getAscendancyOptions(input.ascendancy_name as string, patchVersionId);

    case "find_synergistic_skills":
      return findSynergisticSkills(input.tags as string[], patchVersionId);

    case "find_enabling_uniques":
      return findEnablingUniques(input.keywords as string[], patchVersionId);

    case "find_item_mods":
      return findItemMods(
        input.keywords as string[],
        patchVersionId,
        (input.domain as string | undefined) ?? "item",
      );

    case "check_node_proximity":
      return checkNodeProximity(
        input.node_name_a as string,
        input.node_name_b as string,
        patchVersionId,
      );

    case "validate_build_skeleton":
      return validateBuildSkeleton(input as unknown as SkeletonInput, patchVersionId);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
