// Wire types for /api/builds/import-pob. Mirrors the engine surface
// without taking a hard dependency on @poe2/engine on the client.

export type ItemSlot =
  | "weapon"
  | "offhand"
  | "helmet"
  | "body_armour"
  | "gloves"
  | "boots"
  | "amulet"
  | "ring_left"
  | "ring_right"
  | "belt"
  | "jewel";

export type ItemRarity = "normal" | "magic" | "rare" | "unique";

export interface ItemAffix {
  mod_id: string | null;
  text: string;
  values: number[];
}

export interface BuildItem {
  slot: ItemSlot;
  base_item: string;
  rarity: ItemRarity;
  unique_name: string | null;
  implicits: ItemAffix[];
  affixes: ItemAffix[];
  is_corrupted: boolean;
}

export type SkillRole = "main" | "secondary" | "aura" | "trigger" | "movement";

export interface SupportGem {
  support_id: string;
  level: number;
  quality: number;
}

export interface BuildSkill {
  skill_id: string;
  level: number;
  quality: number;
  role: SkillRole;
  supports: SupportGem[];
  links: number;
}

export interface BuildHeader {
  className?: string;
  ascendancy?: string;
  level?: number;
  targetVersion?: string;
}

export interface DerivedStats {
  combined_dps: number | null;
  total_dps: number | null;
  poison_dps: number | null;
  bleed_dps: number | null;
  ignite_dps: number | null;
  total_ehp: number | null;
  life: number | null;
  es: number | null;
  armour: number | null;
  evasion: number | null;
  fire_res: number | null;
  cold_res: number | null;
  lightning_res: number | null;
  chaos_res: number | null;
  hit_chance: number | null;
  crit_chance: number | null;
  crit_multi: number | null;
  speed: number | null;
}

export interface ImportPobResponse {
  header: BuildHeader;
  stats: DerivedStats;
  raw_player_stats: Record<string, number>;
  build: {
    passives: unknown[];
    items: BuildItem[];
    skills: BuildSkill[];
  };
  warnings: Array<{ level: "info" | "warn"; message: string }>;
}

export interface ApiError {
  error: string;
  detail?: string;
}
