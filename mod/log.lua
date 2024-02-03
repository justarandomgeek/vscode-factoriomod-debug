local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local debug = debug
local type = type
local getmetatable = getmetatable

-- log protection is disabled in Instrument Mode on Factorio >= 0.18.34
-- don't bother attempting the hook otherwise
if not __DebugAdapter.instrument then return end

local oldlog = log
local keepoldlog = __DebugAdapter.keepoldlog
local function newlog(mesg)
  local outmesg = mesg
  local tmesg = type(mesg)
  if tmesg == "table" and (mesg.object_name == "LuaProfiler" or (not getmetatable(mesg) and type(mesg[1])=="string")) then
    outmesg = "\xEF\xB7\x94"..variables.translate(mesg)
  elseif tmesg ~= "string" then
    outmesg = variables.describe(mesg)
  end
  local body = {
    category = "stdout",
    output = outmesg,
  }
  ---@type {source:string, currentline:number}|nil
  local source
  ---@type string
  local loc
  local istail = debug.getinfo(1,"t")
  if istail.istailcall then
    source = {source = "=(...tailcall...)", currentline = 1}
    loc = "=(tailcall):?: "
  else
    local info = debug.getinfo(2,"lS")
    body.line = info.currentline
    source = {source = normalizeLuaSource(info.source), currentline = info.currentline}
    loc = info.source..":"..info.currentline..": "
  end
  __DebugAdapter.outputEvent(body, source)
  if keepoldlog then
    return oldlog({"",loc,mesg})
  end
end
__DebugAdapter.stepIgnore(newlog)

log = newlog