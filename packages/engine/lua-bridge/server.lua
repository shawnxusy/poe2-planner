-- Long-running JSON-RPC server: bridges Node.js to PoB-PoE2's calc engine.
--
-- Protocol (line-delimited JSON, one request per line, one response per line):
--   request:  {"id": <any>, "method": "calc", "xml": "<pob xml>", "stats": ["CombinedDPS", ...]}
--   response: {"id": <same>, "result": {...}}    -- on success
--             {"id": <same>, "error": "..."}      -- on failure
--
-- Design notes:
--   - One persistent process: the build state survives between requests, so
--     the AI build recommender can cheaply iterate (set passive, recalc;
--     swap item, recalc; etc.) without paying the boot cost (~3s).
--   - For independent builds we still call newBuild()+loadBuildFromXML to
--     fully reset state.
--   - We surface PoB's mainOutput, which is the build-view canonical stat
--     dictionary. calcsOutput is the Calcs tab and uses different inputs.
--
-- Bootstrap order matters: HeadlessWrapper must run before any of our code
-- so its globals (build, runCallback, loadBuildFromXML, ...) are available.

-- Step 1: load HeadlessWrapper with a clean arg slate, otherwise the
-- wrapper's main chunk tries to inspect arg[] for a build path and bails.
arg = {}
dofile("HeadlessWrapper.lua")

-- Step 2: JSON encoder/decoder. dkjson ships in the runtime/lua tree.
local json = require("dkjson")

local function safeError(err)
  -- runtime/lua/dkjson tolerates strings; flatten any objects.
  if type(err) == "table" then return json.encode(err) end
  return tostring(err)
end

local function pickStat(out, key)
  -- Key may be dotted (e.g. "Minion.Life") to drill into sub-tables.
  local cur = out
  for segment in string.gmatch(key, "[^%.]+") do
    if type(cur) ~= "table" then return nil end
    cur = cur[segment]
  end
  return cur
end

local function readRequest()
  local line = io.read("*l")
  if not line then return nil end
  -- Tolerate empty lines (heartbeat) by returning a no-op marker.
  if line == "" then return { method = "noop" } end
  local ok, decoded, _, err = pcall(json.decode, line)
  if not ok then
    return { error = "decode failed: " .. tostring(decoded) }
  end
  if err then
    return { error = "decode error: " .. tostring(err) }
  end
  return decoded
end

local function writeResponse(payload)
  io.write(json.encode(payload))
  io.write("\n")
  io.flush()
end

local function handleCalc(req)
  if not req.xml or req.xml == "" then
    return { error = "missing xml" }
  end
  -- Reset to a fresh build so prior state doesn't leak.
  loadBuildFromXML(req.xml, req.name or "bridge")
  -- runCallback already fires inside loadBuildFromXML; one more for safety
  -- after any post-load state mutations the caller may want.
  runCallback("OnFrame")

  local out = build.calcsTab.mainOutput or {}

  -- If `stats` was provided, return only those keys; else return the full
  -- mainOutput (filtered to numeric/string scalars to keep JSON sane).
  local result = {}
  if req.stats and #req.stats > 0 then
    for _, key in ipairs(req.stats) do
      result[key] = pickStat(out, key)
    end
  else
    for k, v in pairs(out) do
      local t = type(v)
      if t == "number" or t == "string" or t == "boolean" then
        result[k] = v
      end
    end
  end

  return { result = result }
end

local METHODS = {
  noop = function() return { result = "ok" } end,
  ping = function() return { result = "pong" } end,
  calc = handleCalc,
}

-- Signal startup completion so the parent knows we're ready.
writeResponse({ event = "ready" })

while true do
  local req = readRequest()
  if not req then break end -- stdin closed
  if req.error then
    writeResponse({ id = nil, error = req.error })
  else
    local handler = METHODS[req.method or ""]
    local resp
    if not handler then
      resp = { id = req.id, error = "unknown method: " .. tostring(req.method) }
    else
      local ok, ret = pcall(handler, req)
      if not ok then
        resp = { id = req.id, error = "handler crashed: " .. safeError(ret) }
      else
        resp = { id = req.id, result = ret.result, error = ret.error }
      end
    end
    writeResponse(resp)
  end
end
