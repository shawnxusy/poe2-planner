// Wire types for /api/builds/import-pob. Mirrors the engine surface
// without taking a hard dependency on @poe2/engine on the client.

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
    items: unknown[];
    skills: unknown[];
  };
  warnings: Array<{ level: "info" | "warn"; message: string }>;
}

export interface ApiError {
  error: string;
  detail?: string;
}
