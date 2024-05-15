local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local variables = require("__debugadapter__/variables.lua")
local print = require("__debugadapter__/print.lua")
local debug = debug
local dgetinfo = debug.getinfo
local type = type
local getmetatable = getmetatable
local __DebugAdapter = __DebugAdapter

local env = _ENV
local _ENV = nil

-- log protection is disabled in Instrument Mode on Factorio >= 0.18.34
-- don't bother attempting the hook otherwise
if not __DebugAdapter.__config.instrument then return end

local oldlog = env.log
local keepoldlog = __DebugAdapter.__config.keepoldlog
local function newlog(mesg)
  local outmesg = mesg
  local tmesg = type(mesg)
  if tmesg == "table" and (mesg.object_name == "LuaProfiler" or (not getmetatable(mesg) and type(mesg[1])=="string")) then
    local tref,err = variables.translate(mesg)
    outmesg = tref or ("<"..err..">")
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
  local istail = dgetinfo(1,"t")
  if istail.istailcall then
    source = {source = "=(...tailcall...)", currentline = 1}
    loc = "=(tailcall):?: "
  else
    local info = dgetinfo(2,"lS")
    body.line = info.currentline
    source = {source = normalizeLuaSource(info.source), currentline = info.currentline}
    loc = info.source..":"..info.currentline..": "
  end
  print.outputEvent(body, source)
  if keepoldlog then
    return oldlog({"",loc,mesg})
  end
end

env.log = newlog