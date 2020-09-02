local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require('__debugadapter__/json.lua')
local variables = require("__debugadapter__/variables.lua") -- uses pcall

local oldlog = log
local keepoldlog = __DebugAdapter.keepoldlog
local function newlog(mesg)
  local outmesg = mesg
  local tmesg = type(mesg)
  if variables.translate and tmesg == "table" and (mesg.object_name == "LuaProfiler" or (not getmetatable(mesg) and type(mesg[1])=="string")) then
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

-- log protection is disabled in Instrument Mode on Factorio >= 0.18.34
if __DebugAdapter.instrument then
  local base_version = (mods or script.active_mods).base
  if not base_version then
    log = newlog
    return
  end  
  local a,b,c = base_version:match("(%d+).(%d+).(%d+)")
  if (a=="1" or (a=="0" and b=="18" and (tonumber(c) or 0)>=34)) then
    log = newlog
    return
  end
end

-- older version still require the evil version of the hook
newlog("installing legacy `log` hook in " .. (data and "data" or script.mod_name or "?"))

log = nil
local gmeta = getmetatable(_ENV)
if not gmeta then
  gmeta = {}
  setmetatable(_ENV,gmeta)
end
local oldindex = gmeta.__index
local do_old_index = ({
  ["nil"] = function(t,k)
    return nil
  end,
  ["function"] = oldindex,
  ["table"] = function(t,k)
    return oldindex[k]
  end,
})[type(oldindex)]

function gmeta.__index(t,k)
  if k == "log" then
    local parent = debug.getinfo(2,"n")
    if parent then
      return newlog
    else
      return oldlog
    end
  end
  return do_old_index(t,k)
end
__DebugAdapter.stepIgnore(gmeta.__index)
