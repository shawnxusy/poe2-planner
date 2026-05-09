// Number formatters tuned for PoE-style readouts.

export function fmtBig(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "b";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "m";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (n >= 1000) return (n / 1000).toFixed(2) + "k";
  return Math.round(n).toString();
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits) + "%";
}

export function fmtMulti(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // PoB stores crit multi as a multiplier (e.g. 5.29 → +429%).
  if (n > 1.5) return "+" + Math.round((n - 1) * 100) + "%";
  return n.toFixed(2) + "x";
}

// Converts PoB internal skill/support IDs to human-readable names.
// "IceStrikePlayer" → "Ice Strike"
// "SupportRapidAttacksPlayerTwo" → "Rapid Attacks"
export function formatSkillId(id: string): string {
  const name = id
    .replace(/^Support/, "")
    .replace(/Player(Two|Three|Four)?$/, "");
  return name.replace(/([A-Z])/g, " $1").trim();
}
