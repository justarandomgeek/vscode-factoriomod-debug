__DebugAdapter = {}
-- require DA to have a non-pcall require for syntax checking
--require('__debugadapter__/debugadapter.lua')


local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints
local json = require('__debugadapter__/json.lua')
local script = script
local remote = remote
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

local function attach()
  callAll("attach")
end

local function detach()
  callAll("detach")
end

local function updateBreakpoints(change)
  local source,changedbreaks = ReadBreakpoints(change)
  callAll("setBreakpoints",source,changedbreaks)
end
__DebugAdapter.updateBreakpoints = updateBreakpoints

local function modules()
  local mods = {}
  for name,version in pairs(game.active_mods) do
    mods[#mods+1] = {
      id = name, name = name,
      version = version,
    }
  end
  mods[#mods+1] = { id = "level", name = "level", }
  print("EVTmodules: " .. json.encode(mods))
end

local whoiscache = {}
local function whois(remotename)
  local interfaces = remote.interfaces
  local call = remote.call

  remotename = whoiscache[remotename] or remotename
  local debugname = "__debugadapter_"..remotename
  if interfaces[debugname] then
    if call(debugname,"remoteHasInterface",remotename) then
      whoiscache[remotename] = remotename
      return remotename
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

script.on_init(function()
  attach()
  modules()
  print("DBG: on_init")
  debug.debug()
end)

script.on_load(function()
  attach()
  --modules() --TODO: 0.18 script.active_mods
  print("DBG: on_load")
  debug.debug()
end)

local firsttick = true
script.on_event(defines.events.on_tick,function()
  if firsttick then
    firsttick = false
    modules()
    print("DBG: on_first_tick")
    debug.debug()
  else
    print("DBG: on_tick")
    debug.debug()
  end
end)

remote.add_interface("debugadapter",{
  attach = attach,
  detach = detach,
  updateBreakpoints = updateBreakpoints,
  whois = whois,
})