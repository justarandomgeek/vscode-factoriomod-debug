local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require('__debugadapter__/json.lua')
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local print = print
local debug = debug

-- log protection is disabled in Instrument Mode on Factorio >= 0.18.34
-- don't bother attempting the hook otherwise
if not __DebugAdapter.instrument then return end

local oldlog = log
local keepoldlog = __DebugAdapter.keepoldlog
local function newlog(mesg)
  local outmesg = mesg
  local tmesg = type(mesg)
  if tmesg == "table" and (mesg.object_name == "LuaProfiler" or (not getmetatable(mesg) and type(mesg[1])=="string")) then
    outmesg = "{LocalisedString "..variables.translate(mesg).."}"
  elseif tmesg ~= "string" then
    outmesg = variables.describe(mesg)
  end
  local body = {
    category = "stdout",
    output = outmesg,
    };
  local istail = debug.getinfo(1,"t")
  local loc
  if istail.istailcall then
    body.line = 1
    body.source = "=(...tailcall...)"
    loc = "=(...tailcall...)"
  else
    local info = debug.getinfo(2,"lS")
    body.line = info.currentline
    body.source = normalizeLuaSource(info.source)
    loc = info.source..":"..info.currentline..": "
  end
  print("DBGprint: " .. json.encode(body))
  if keepoldlog then
    return oldlog({"",loc,mesg})
  end
end
__DebugAdapter.stepIgnore(newlog)

log = newlog