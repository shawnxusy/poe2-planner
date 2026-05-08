// RePoE-Fork serves PoE2 game data via GitHub Pages. Files are minified JSON
// at predictable paths. Pretty (non-minified) variants exist without `.min`
// but cost more bandwidth.
const REPOE_BASE = "https://repoe-fork.github.io/poe2";

export function repoeUrl(file: string): string {
  return `${REPOE_BASE}/${file}`;
}

// version.txt holds GGG's internal client version (e.g., "4.4.0.11.2").
// We read this on every ingest run to detect if upstream has rolled forward.
export const VERSION_TXT_URL = "https://raw.githubusercontent.com/repoe-fork/poe2/master/version.txt";
