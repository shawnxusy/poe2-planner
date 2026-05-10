// Static seed data for PoE2 0.4 Augments (formerly called Runes).
// Augments socket into weapons and armour for bonus stats.
// IMPORTANT: caster weapons (wands, staves) and jewellery have 0 sockets.
// Soul Cores are a separate mechanic (Trials of Chaos reward) — not covered here.

import { db, augments } from "@poe2/db";
import { sql } from "drizzle-orm";
import { info } from "../lib/log.js";

interface AugmentSeed {
  name: string;
  slot_types: string[];
  effect: string;
  tier: number | null;
}

// Valid slot types: 'weapon', 'armour', 'shield', 'quiver'
// NOTE: wands, staves, rings, amulets have 0 sockets in PoE2 0.4
const AUGMENTS_0_4: AugmentSeed[] = [
  // Physical / Accuracy
  {
    name: "Iron Augment",
    slot_types: ["weapon", "armour", "shield"],
    effect: "Adds flat Accuracy Rating",
    tier: 1,
  },
  {
    name: "Jagged Augment",
    slot_types: ["weapon"],
    effect: "Adds flat Physical Damage to Attacks",
    tier: 1,
  },
  // Elemental damage (weapon-only for damage versions)
  {
    name: "Crimson Augment",
    slot_types: ["weapon"],
    effect: "Adds flat Fire Damage to Attacks",
    tier: 1,
  },
  {
    name: "Shuddering Augment",
    slot_types: ["weapon"],
    effect: "Adds flat Cold Damage to Attacks",
    tier: 1,
  },
  {
    name: "Azure Augment",
    slot_types: ["weapon"],
    effect: "Adds flat Lightning Damage to Attacks",
    tier: 1,
  },
  {
    name: "Verdant Augment",
    slot_types: ["weapon"],
    effect: "Adds flat Chaos Damage to Attacks",
    tier: 1,
  },
  // Defensive (armour, shield)
  {
    name: "Coral Augment",
    slot_types: ["armour", "shield"],
    effect: "Adds flat maximum Life",
    tier: 1,
  },
  {
    name: "Prismatic Augment",
    slot_types: ["armour", "shield", "weapon"],
    effect: "Adds Elemental Resistance",
    tier: 1,
  },
  {
    name: "Dense Augment",
    slot_types: ["armour", "shield"],
    effect: "Adds flat Armour Rating",
    tier: 1,
  },
  {
    name: "Serrated Augment",
    slot_types: ["armour", "shield"],
    effect: "Adds flat Evasion Rating",
    tier: 1,
  },
];

export async function seedAugments(patchVersionId: number): Promise<number> {
  const rows = AUGMENTS_0_4.map((a) => ({
    patch_version_id: patchVersionId,
    ...a,
  }));

  await db
    .insert(augments)
    .values(rows)
    .onConflictDoUpdate({
      target: [augments.patch_version_id, augments.name],
      set: {
        slot_types: sql`excluded.slot_types`,
        effect: sql`excluded.effect`,
        tier: sql`excluded.tier`,
      },
    });

  info("augments: seeded", { count: rows.length });
  return rows.length;
}
