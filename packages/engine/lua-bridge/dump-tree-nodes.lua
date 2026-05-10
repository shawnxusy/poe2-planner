-- Extract all passive tree nodes with adjacency data and computed positions.
-- tree.lua is self-contained, no HeadlessWrapper needed.
--
-- Usage:
--   luajit dump-tree-nodes.lua [/path/to/tree.lua]
-- Default path: /tmp/pob-poe2/src/TreeData/0_4/tree.lua
--
-- Output: one JSON object per line (NDJSON):
--   { skill, name, type, x, y, connections[], stats[], ascendancy_name?, is_keystone?, is_notable? }
--
-- node.type values:
--   "class_start"        — character starting node
--   "ascendancy_start"   — ascendancy entry point
--   "ascendancy_notable" — ascendancy named notable
--   "ascendancy_keystone"— ascendancy keystone
--   "ascendancy_normal"  — other ascendancy node
--   "keystone"           — tree keystone
--   "notable"            — tree named notable
--   "jewel_socket"       — jewel socket
--   "attribute"          — attribute (+Str/Dex/Int) node
--   "mastery"            — mastery node (centre of notable cluster)
--   "small"              — plain small passive

local treePath = arg and arg[1] or "/tmp/pob-poe2/src/TreeData/0_4/tree.lua"

local loader, err = loadfile(treePath)
if not loader then
  io.stderr:write("Failed to load " .. treePath .. ": " .. tostring(err) .. "\n")
  os.exit(1)
end
local tree = loader()

-- ── Orbit geometry ──────────────────────────────────────────────────────────

local constants = tree.constants or {}
-- orbitRadii and orbitAnglesByOrbit are 1-indexed (orbit 0 → index 1)
local orbitRadii = constants.orbitRadii or {}
local orbitAngles = constants.orbitAnglesByOrbit or {}
local skillsPerOrbit = constants.skillsPerOrbit or {}

-- Build a lookup: groups[id] → {x, y}
local groups = tree.groups or {}

-- Compute world position for a node given its group, orbit, and orbitIndex.
-- PoE2 convention: x = groupX + sin(angle)*radius, y = groupY - cos(angle)*radius
local function nodePosition(groupId, orbit, orbitIndex)
  local g = groups[groupId]
  if not g then return 0, 0 end
  -- orbitIndex in tree.lua is 0-based; orbitAngles arrays are 1-based (index 1 = angle 0)
  local luaOrbit = (orbit or 0) + 1  -- lua 1-indexed orbit number
  local radius = orbitRadii[luaOrbit] or 0
  if radius == 0 then
    return g.x, g.y
  end
  local angles = orbitAngles[luaOrbit]
  local angle
  if angles then
    -- orbitIndex 0 → angles[1], orbitIndex k → angles[k+1]
    angle = angles[(orbitIndex or 0) + 1] or 0
  else
    local count = skillsPerOrbit[luaOrbit] or 1
    angle = (2 * math.pi * (orbitIndex or 0)) / count
  end
  return g.x + math.sin(angle) * radius, g.y - math.cos(angle) * radius
end

-- ── JSON helpers ─────────────────────────────────────────────────────────────

local function escStr(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"',  '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  s = s:gsub('\t', '\\t')
  return s
end

local function jsonStr(v)  return '"' .. escStr(v) .. '"' end
local function jsonNum(v)  return string.format("%.2f", v or 0) end
local function jsonBool(v) return v and "true" or "false" end

local function jsonStrArray(arr)
  local parts = {}
  for i = 1, #(arr or {}) do
    parts[i] = jsonStr(arr[i])
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function jsonIntArray(arr)
  local parts = {}
  for i = 1, #(arr or {}) do
    parts[i] = tostring(arr[i])
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

-- ── Node type classification ─────────────────────────────────────────────────

local function classifyNode(node)
  if node.isAscendancyStart then return "ascendancy_start" end
  if node.ascendancyName then
    if node.isKeystone then return "ascendancy_keystone" end
    if node.isNotable  then return "ascendancy_notable"  end
    return "ascendancy_normal"
  end
  if node.classStartIndex ~= nil then return "class_start" end
  if node.isKeystone    then return "keystone"     end
  if node.isNotable     then return "notable"      end
  if node.isJewelSocket then return "jewel_socket" end
  if node.isAttribute   then return "attribute"    end
  if node.isMastery     then return "mastery"      end
  return "small"
end

-- ── Extract adjacency: connections[]→ array of neighbor skill IDs ───────────

local function extractConnections(node)
  local ids = {}
  local conns = node.connections or {}
  for i = 1, #conns do
    ids[i] = conns[i].id
  end
  return ids
end

-- ── Main output ───────────────────────────────────────────────────────────────

local nodes = tree.nodes or {}
local count = 0

for id, node in pairs(nodes) do
  local x, y = nodePosition(node.group, node.orbit, node.orbitIndex)
  local nodeType = classifyNode(node)
  local connIds = extractConnections(node)

  local skillId = tostring(node.skill or id)
  local name    = node.name or ""
  local stats   = node.stats or {}
  local asc     = node.ascendancyName

  local parts = {
    '"skill":',   jsonStr(skillId),
    ',"name":',   jsonStr(name),
    ',"type":',   jsonStr(nodeType),
    ',"x":',      jsonNum(x),
    ',"y":',      jsonNum(y),
    ',"connections":', jsonIntArray(connIds),
    ',"stats":',  jsonStrArray(stats),
  }

  if asc then
    parts[#parts+1] = ',"ascendancy_name":'
    parts[#parts+1] = jsonStr(asc)
  end
  if node.isKeystone then
    parts[#parts+1] = ',"is_keystone":true'
  end
  if node.isNotable then
    parts[#parts+1] = ',"is_notable":true'
  end

  io.write("{" .. table.concat(parts) .. "}\n")
  count = count + 1
end

io.stderr:write("dump-tree-nodes: emitted " .. count .. " nodes\n")
