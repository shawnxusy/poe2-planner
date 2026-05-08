// PathOfBuilding-PoE2 hosts unique item data as Lua tables in a flat structure
// under src/Data/Uniques/. The default branch is `dev`. We pull from raw.
const POB_RAW_BASE =
  "https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev";

export function pobUniquesUrl(file: string): string {
  return `${POB_RAW_BASE}/src/Data/Uniques/${file}`;
}

// All known PoE2 unique slot files. Some are placeholder stubs in the repo
// (~60-byte `return {}` files) and are filtered out by the parser when no
// item blocks are found.
export const POB_UNIQUE_FILES = [
  "amulet.lua",
  "belt.lua",
  "body.lua",
  "boots.lua",
  "bow.lua",
  "crossbow.lua",
  "flask.lua",
  "focus.lua",
  "gloves.lua",
  "helmet.lua",
  "jewel.lua",
  "mace.lua",
  "quiver.lua",
  "ring.lua",
  "sceptre.lua",
  "shield.lua",
  "spear.lua",
  "staff.lua",
];
