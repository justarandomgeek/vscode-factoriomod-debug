if __Profiler then
  require("__debugadapter__/profile_control.lua")
  return
end

__DebugAdapter = __DebugAdapter or {
  stepIgnore = function(f) return f end,
  stepIgnoreAll = function(t) return t end,
}

local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints
local json = require('__debugadapter__/json.lua')
local script = script
local remote = remote
remote = rawget(remote,"__raw") or remote
local debug = debug
local print = print
local pairs = pairs

--- call a remote function in all registered mods
---@param funcname string Name of remote function to call
---@return table<string,any> Results indexed by mod name
local function callAll(funcname,...)
  local results = {}
  local call = remote.call
  for remotename,_ in pairs(remote.interfaces) do
    local modname = remotename:match("^__debugadapter_(.+)$")
    if modname then
      results[modname] = call(remotename,funcname,...)
    end
  end
  return results
end
__DebugAdapter.stepIgnore(callAll)

local function updateBreakpoints(change)
  local source,changedbreaks = ReadBreakpoints(change)
  callAll("setBreakpoints",source,changedbreaks)
end
__DebugAdapter.updateBreakpoints = updateBreakpoints

local whoiscache = {}
local function whois(remotename)
  local interfaces = remote.interfaces
  local call = remote.call

  local firstguess = whoiscache[remotename] or remotename
  local debugname = "__debugadapter_"..firstguess
  if interfaces[debugname] then
    if call(debugname,"remoteHasInterface",firstguess) then
      whoiscache[remotename] = firstguess
      return firstguess
    end
  end

  for interfacename,_ in pairs(interfaces) do
    local modname = interfacename:match("^__debugadapter_(.+)$")
    if modname then
      if call(interfacename,"remoteHasInterface",remotename) then
        whoiscache[remotename] = modname
        return modname
      end
    end
  end

  return nil
end

script.on_init(__DebugAdapter.stepIgnore(function()
  print("DBG: on_init")
  debug.debug()
end))

script.on_load(__DebugAdapter.stepIgnore(function()
  print("DBG: on_load")
  debug.debug()
end))

script.on_event(defines.events.on_tick,__DebugAdapter.stepIgnore(function()
  print("DBG: on_tick")
  debug.debug()
end))

remote.add_interface("debugadapter",__DebugAdapter.stepIgnoreAll{
  updateBreakpoints = updateBreakpoints,
  whois = whois,
  error = error,
})