-- Extract ascendancy nodes from PoB tree.lua and emit a JSON array.
-- tree.lua is self-contained (just returns a table), so no HeadlessWrapper needed.
--
-- Usage:
--   luajit dump-ascendancy-nodes.lua [/path/to/tree.lua]
-- Default path: /tmp/pob-poe2/src/TreeData/0_4/tree.lua
--
-- Output: JSON array of:
--   { skill, name, ascendancy_name, is_notable, is_keystone, stats[] }

local treePath = arg and arg[1] or "/tmp/pob-poe2/src/TreeData/0_4/tree.lua"

local loader, err = loadfile(treePath)
if not loader then
  io.stderr:write("Failed to load " .. treePath .. ": " .. tostring(err) .. "\n")
  os.exit(1)
end
local tree = loader()

local function escapeStr(s)
  s = tostring(s)
  s = s:gsub('\\', '\\\\')
  s = s:gsub('"', '\\"')
  s = s:gsub('\n', '\\n')
  s = s:gsub('\r', '\\r')
  s = s:gsub('\t', '\\t')
  return s
end

local function boolStr(v)
  return v and "true" or "false"
end

local pieces = {}
table.insert(pieces, "[")
local first = true
for id, node in pairs(tree.nodes or {}) do
  if node.ascendancyName then
    local stats = {}
    for i = 1, #(node.stats or {}) do
      stats[i] = '"' .. escapeStr(node.stats[i]) .. '"'
    end
    if not first then table.insert(pieces, ",") end
    first = false
    table.insert(pieces, string.format(
      '{"skill":"%s","name":"%s","ascendancy_name":"%s","is_notable":%s,"is_keystone":%s,"stats":[%s]}',
      escapeStr(tostring(id)),
      escapeStr(node.name or ""),
      escapeStr(node.ascendancyName),
      boolStr(node.isNotable),
      boolStr(node.isKeystone),
      table.concat(stats, ",")
    ))
  end
end
table.insert(pieces, "]")
print(table.concat(pieces))
