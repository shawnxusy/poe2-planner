// Static seed data for PoE2 0.4 charms.
// Charms replaced utility flasks; they auto-trigger based on conditions.
// Belt implicit provides 1–2 charm slots; quest reward provides 1 more.
// Source: community wikis + in-game testing as of 0.4 (Fate of the Vaal).

import { db, charms } from "@poe2/db";
import { sql } from "drizzle-orm";
import { info } from "../lib/log.js";

interface CharmSeed {
  name: string;
  charm_type: string;
  trigger_condition: string | null;
  effect: string;
  effect_duration_ms: number | null;
  charges_max: number | null;
  charges_per_use: number | null;
}

const CHARMS_0_4: CharmSeed[] = [
  // Ailment immunity charms (near-mandatory endgame)
  {
    name: "Amethyst Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you become Poisoned",
    effect: "Immunity to Poison for 4 seconds; removes Poison",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Jade Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you start Bleeding",
    effect: "Immunity to Bleeding for 4 seconds; removes Bleeding",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Ruby Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you are Ignited",
    effect: "Immunity to Ignite for 4 seconds; removes Ignite",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Sapphire Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you are Frozen or Chilled",
    effect: "Immunity to Freeze and Chill for 4 seconds; removes Freeze",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Topaz Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you are Shocked",
    effect: "Immunity to Shock for 4 seconds; removes Shock",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  // Defensive utility charms
  {
    name: "Iron Charm",
    charm_type: "ailment_immunity",
    trigger_condition: "when you are Stunned",
    effect: "Immunity to Stun for 4 seconds; removes Stun",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Granite Charm",
    charm_type: "buff",
    trigger_condition: "when you take a Hit",
    effect: "+3000 to Armour Rating for 4 seconds",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  // Offensive utility charms
  {
    name: "Silver Charm",
    charm_type: "buff",
    trigger_condition: "on Kill",
    effect: "Onslaught for 4 seconds (20% increased attack, cast, and movement speed)",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Bismuth Charm",
    charm_type: "buff",
    trigger_condition: "when you take Elemental Damage",
    effect: "+25% to all Elemental Resistances for 4 seconds",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Quartz Charm",
    charm_type: "utility",
    trigger_condition: "when you use a Skill",
    effect: "Phasing and 10% chance to Dodge Attacks and Spells for 4 seconds",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Gold Charm",
    charm_type: "utility",
    trigger_condition: "on Kill",
    effect: "Increased Item Rarity and Item Quantity for 4 seconds",
    effect_duration_ms: 4000,
    charges_max: 3,
    charges_per_use: 1,
  },
  {
    name: "Cinnabar Charm",
    charm_type: "buff",
    trigger_condition: "when you use a Flask",
    effect: "Increases flask effect duration",
    effect_duration_ms: null,
    charges_max: 3,
    charges_per_use: 1,
  },
];

export async function seedCharms(patchVersionId: number): Promise<number> {
  const rows = CHARMS_0_4.map((c) => ({
    patch_version_id: patchVersionId,
    ...c,
  }));

  await db
    .insert(charms)
    .values(rows)
    .onConflictDoUpdate({
      target: [charms.patch_version_id, charms.name],
      set: {
        charm_type: sql`excluded.charm_type`,
        trigger_condition: sql`excluded.trigger_condition`,
        effect: sql`excluded.effect`,
        effect_duration_ms: sql`excluded.effect_duration_ms`,
        charges_max: sql`excluded.charges_max`,
        charges_per_use: sql`excluded.charges_per_use`,
      },
    });

  info("charms: seeded", { count: rows.length });
  return rows.length;
}
