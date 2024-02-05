__DebugAdapter = __DebugAdapter or {

  nohook = true,
}

---@param t table<string,any>
local function DAMerge(t)
  for k, v in pairs(t) do
    __DebugAdapter[k] = v
  end
end

local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints
local script = script
---@type LuaRemote
local remote = remote and (type(remote)=="table" and rawget(remote,"__raw")) or remote
local debug = debug
local print = print
local pairs = pairs
local match = string.match

if __DebugAdapter.nohook then
  -- might have already been run, but load it now if not
  DAMerge(require("__debugadapter__/stepping.lua"))
  DAMerge(require("__debugadapter__/stacks.lua"))
end

--- call a remote function in all registered mods
---@param funcname string Name of remote function to call
---@return table<string,Any> Results indexed by mod name
local function callAll(funcname,...)
  ---@type table<string,Any>
  local results = {}
  local call = remote.call
  for remotename,_ in pairs(remote.interfaces) do
    local modname = match(remotename,"^__debugadapter_(.+)$")
    if modname then
      ---@type Any?
      local result = call(remotename,funcname,...)
      results[modname] = result
    end
  end
  return results
end
__DebugAdapter.stepIgnore(callAll)

-- calls from other entrypoints come here anyway, so just skip right to it
---@param change string
local function updateBreakpoints(change)
  ---@typelist string,SourceBreakpoint[]
  local source,changedbreaks = ReadBreakpoints(change)
  callAll("setBreakpoints",source,changedbreaks)
end
__DebugAdapter.stepIgnore(updateBreakpoints)
__DebugAdapter.updateBreakpoints = updateBreakpoints

---@type DAvarslib
local variables = require("__debugadapter__/variables.lua")
if __DebugAdapter.nohook then
  -- if hooks are not installed, we need to set up enough of the libraries for
  -- calls that come in here (mostly on_tick) to be able to run appropriately,
  -- and enough to track long refs logged from DA's lua state correctly still
  DAMerge(variables.__)
  DAMerge(require("__debugadapter__/evaluate.lua"))
  DAMerge(require("__debugadapter__/print.lua"))

  -- and a minimal version of the __da_da remote so other lua can print vars
  remote.add_interface("__debugadapter_" .. script.mod_name ,{
    setBreakpoints = function() end,
    longVariables = __DebugAdapter.variables,
    evaluate = __DebugAdapter.evaluate,
    dump = function() end,
    source = function() end,
    stackTrace = __DebugAdapter.stackTrace,
  })
end

local sharedevents = {}
script.on_init(__DebugAdapter.stepIgnore(function()
  print("\xEF\xB7\x90\xEE\x80\x89")
  debug.debug()
  if sharedevents.on_init then return sharedevents.on_init() end
end))

script.on_load(__DebugAdapter.stepIgnore(function()
  print("\xEF\xB7\x90\xEE\x80\x8A")
  debug.debug()
  if sharedevents.on_load then return sharedevents.on_load() end
end))

---@param e table
script.on_event(defines.events.on_tick,__DebugAdapter.stepIgnore(function(e)
  print("\xEF\xB7\x90\xEE\x80\x86")
  debug.debug()
  if sharedevents.on_tick then return sharedevents.on_tick(e) end
end))

remote.add_interface("debugadapter",__DebugAdapter.stepIgnore{
  updateBreakpoints = updateBreakpoints,

  getStepping = __DebugAdapter.getStepping,
  setStepping = __DebugAdapter.setStepping,
})

return sharedevents