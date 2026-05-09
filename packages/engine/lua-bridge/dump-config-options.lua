-- Read PoB's ConfigOptions table and emit a JSON summary for codegen.
-- Run via the bridge's bootstrap:
--   luajit -l HeadlessWrapper dump-config-options.lua
-- but in practice we concat HeadlessWrapper + this file (see package.json
-- "manifest:config-options" script) so the loader globals exist.
--
-- Emits a single JSON object on stdout:
--   { "total": N,
--     "by_type": {...},
--     "options": [ { var, type, label, defaultIndex, defaultState,
--                    list?, ifCond?, ifSkill?, ifMod?, ... } ] }
--
-- We deliberately drop the `apply` Lua function (not serialisable) and
-- any tooltip values that are functions (PoB's tooltips can be dynamic).

local options = LoadModule("Modules/ConfigOptions")
local json = require("dkjson")

local function trimList(list)
  if not list then return nil end
  local out = {}
  for i, item in ipairs(list) do
    out[i] = { val = item.val, label = item.label }
  end
  return out
end

local function safeStr(v)
  if type(v) == "string" then return v end
  return nil
end

local function tooltipString(v)
  -- Tooltip can be a string, function, or composite. Only emit literal
  -- strings — codegen consumers shouldn't run Lua to compute help text.
  if type(v) == "string" then return v end
  return nil
end

local out = {}
local byType = {}
for _, opt in ipairs(options or {}) do
  if opt.var then
    byType[opt.type or "unknown"] = (byType[opt.type or "unknown"] or 0) + 1
    table.insert(out, {
      var = opt.var,
      type = opt.type,
      label = safeStr(opt.label),
      tooltip = tooltipString(opt.tooltip),
      defaultIndex = opt.defaultIndex,
      defaultState = opt.defaultState,
      ifCond = opt.ifCond,
      ifSkill = opt.ifSkill,
      ifMod = opt.ifMod,
      ifSkillData = opt.ifSkillData,
      ifFlag = opt.ifFlag,
      ifMinionCond = opt.ifMinionCond,
      ifTagType = opt.ifTagType,
      list = trimList(opt.list),
    })
  end
end

print(json.encode({
  total = #out,
  by_type = byType,
  options = out,
}, { indent = false }))
