-- force canonical name require
if ... ~= "__debugadapter__/debugadapter.lua" then
  return require("__debugadapter__/debugadapter.lua")
end

if __Profiler then
  log{"", "Attempted to require debugadapter in ", script.mod_name, " with profile hook already installed"}
  return
end

if data then
  -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
  local reg = debug.getregistry()
  ---@type DebugAdapter
  local regDA = reg.__DebugAdapter
  if regDA then return regDA end
end


-- Various fields set by vscode to configure the debug adapter
---@class DebugAdapter.Config
---@field instrument boolean set in DA's instrument-*.lua
---@field nohook boolean set in DA's control.lua if it does not have hooks installed
---@field hooklog? boolean enable replacing `log`
---@field keepoldlog? boolean when set, `log` replacement will still call original `log`
---@field runningBreak? number frequency to check for pause in long-running code
---@field hascurrentpc? boolean set to `true` if debug.getinfo supports 'p'->`currentpc`


-- this is a global so the vscode extension can get to it from debug.debug()
---@class DebugAdapter : DebugAdapter.Config, DebugAdapter.Stepping, DebugAdapter.Variables, DebugAdapter.Evaluate, DebugAdapter.Print, DebugAdapter.Entrypoints, DebugAdapter.Stacks
local __DebugAdapter = _ENV.__DebugAdapter or {} -- but might have been defined already for selective instrument mode
_ENV.__DebugAdapter = __DebugAdapter

---@param t table<string,any>
local function DAMerge(t)
  for k, v in pairs(t) do
    __DebugAdapter[k] = v
  end
end

local require = require

-- capture raw remote before it gets replaced
local remote = remote

pcall(function()
  -- see if we have debug.getinfo(,"p") to get currentpc
  -- if not, this will throw and exit the pcall immediately before setting flag
  local _ = debug.getinfo(1,"p")
  __DebugAdapter.hascurrentpc = true
end)

--this has to be first before requiring other files so they can mark functions as ignored
DAMerge(require("__debugadapter__/stepping.lua"))

require("__debugadapter__/luaobjectinfo.lua") -- uses pcall

local variables = require("__debugadapter__/variables.lua") -- uses pcall
DAMerge(variables.__)
require("__debugadapter__/normalizeLuaSource.lua") -- uses pcall, not used here but do it now for load order
DAMerge(require("__debugadapter__/evaluate.lua")) -- uses pcall
local json = require('__debugadapter__/json.lua')
if __DebugAdapter.hooklog ~= false then
  require("__debugadapter__/log.lua") -- uses pcall
end
DAMerge(require("__debugadapter__/print.lua")) -- uses evaluate/variables
DAMerge(require("__debugadapter__/entrypoints.lua")) -- must be after anyone using pcall/xpcall

DAMerge(require("__debugadapter__/stacks.lua"))
require("__debugadapter__/test.lua")

local script = script
local debug = debug
local print = print
local pairs = pairs
local match = string.match

---Called by VSCode to retreive source for a function
---@param id number
---@param seq number request sequence number
---@param internal boolean Don't look in other LuaStates
---@return boolean
function __DebugAdapter.source(id, seq, internal)

  local ref = variables.longrefs[id]
  if ref and ref.type == "Source" then ---@cast ref DAvarslib.SourceRef
    print("\xEF\xB7\x96" .. json.encode{seq=seq, body=ref.source})
    return true
  end
  if internal then return false end
  -- or remote lookup to find a long ref in another lua...
  if __DebugAdapter.canRemoteCall() then
    local call = remote.call
    for remotename,_ in pairs(remote.interfaces) do
      local modname = match(remotename, "^__debugadapter_(.+)$")
      if modname then
        if call(remotename,"source",id,seq,true) then
          return true
        end
      end
    end
  end

  print("\xEF\xB7\x96" .. json.encode{seq=seq, body=nil})
  return false
end

__DebugAdapter.stepIgnore(__DebugAdapter)
do
  local ininstrument = ""
  if __DebugAdapter.instrument then
    ininstrument = " in Instrument Mode"
  end

  if data then
    __DebugAdapter.print("debugadapter registered for data" .. ininstrument, nil, nil, "console")
    __DebugAdapter.attach()
    print("\xEF\xB7\x90\xEE\x80\x87")
    debug.debug()
    -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
    local reg = debug.getregistry()
    reg.__DebugAdapter = __DebugAdapter
  else
    -- in addition to the global, set up a remote so we can configure from DA's on_tick
    -- and pass stepping state around remote calls
    __DebugAdapter.print("debugadapter registered for " .. script.mod_name .. ininstrument, nil, nil, "console")
    remote.add_interface("__debugadapter_" .. script.mod_name ,{
      setBreakpoints = __DebugAdapter.setBreakpoints,
      longVariables = __DebugAdapter.variables,
      stackTrace = __DebugAdapter.stackTrace,
      evaluate = __DebugAdapter.evaluate,
      source = __DebugAdapter.source,
      raise_event = __DebugAdapter.raise_event,
    })

    __DebugAdapter.attach()
    print("\xEF\xB7\x90\xEE\x80\x88")
    debug.debug()
  end
end

return __DebugAdapter