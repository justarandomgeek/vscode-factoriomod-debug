__DebugAdapter = __DebugAdapter or {
  stepIgnore = function(f) return f end,
  stepIgnoreAll = function(t) return t end,
}

local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints
local json = require("__debugadapter__/json.lua")
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

-- alternate versions of various DA functions that get called from debug prompts in events here
-- updateBreakpoints - calls from other entrypoints come here anyway, so just be skip right to it
-- variables - if no hooks here, calls from prompt need to be passed around to find the ref
-- evaluate - if no hooks here, calls while running need to be redirected to level

local function updateBreakpoints(change)
  local source,changedbreaks = ReadBreakpoints(change)
  callAll("setBreakpoints",source,changedbreaks)
end
__DebugAdapter.updateBreakpoints = updateBreakpoints

if not __DebugAdapter.variables then
  function __DebugAdapter.variables(variablesReference,seq,filter,start,count)
    local call = remote.call
    for remotename,_ in pairs(remote.interfaces) do
      local modname = remotename:match("^__debugadapter_(.+)$")
      if modname then
        if call(remotename,"longVariables",variablesReference,seq,filter,start,count,true) then
          return true
        end
      end
    end
    local vars = {
      {
        name= "Expired variablesReference",
        value= "Expired variablesReference ref="..variablesReference.." seq="..seq,
        variablesReference= 0,
      },
    }
    print("DBGvars: " .. json.encode({variablesReference = variablesReference, seq = seq, vars = vars}))
    return true
  end
end

if not __DebugAdapter.evaluate then
  function __DebugAdapter.evaluate(frameId,context,expression,seq)
    if not frameId then
      if remote.interfaces["__debugadapter_level"] then
          return remote.call("__debugadapter_level","evaluate",frameId,context,expression,seq)
      else
        return print("DBGeval: " .. json.encode({result = "`level` not available for eval", type="error", variablesReference=0, seq=seq}))
      end
    end
    local evalresult = {result = "Cannot Evaluate in Remote Frame", type="error", variablesReference=0, seq=seq}
    print("DBGeval: " .. json.encode(evalresult))
  end
end

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

local sharedevents = {}
script.on_init(__DebugAdapter.stepIgnore(function()
  print("DBG: on_init")
  debug.debug()
  if sharedevents.on_init then return sharedevents.on_init() end
end))

script.on_load(__DebugAdapter.stepIgnore(function()
  print("DBG: on_load")
  debug.debug()
  if sharedevents.on_load then return sharedevents.on_load() end
end))

script.on_event(defines.events.on_tick,__DebugAdapter.stepIgnore(function(e)
  print("DBG: on_tick")
  debug.debug()
  if sharedevents.on_tick then return sharedevents.on_tick(e) end
end))

remote.add_interface("debugadapter",__DebugAdapter.stepIgnoreAll{
  updateBreakpoints = updateBreakpoints,
  whois = whois,
})

return sharedevents