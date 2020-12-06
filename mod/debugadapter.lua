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
  local regDA = reg.__DebugAdapter
  if regDA then return regDA end
end

-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = __DebugAdapter or {} -- but might have been defined already for selective instrument mode
local __DebugAdapter = __DebugAdapter
local require = require
--this has to be first before requiring other files so they can mark functions as ignored
require("__debugadapter__/stepping.lua")

require("__debugadapter__/luaobjectinfo.lua") -- uses pcall
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local remotestepping
if script then -- don't attempt to hook in data stage
  remotestepping = require("__debugadapter__/remotestepping.lua") -- uses xpcall in non-instrument mode
end
require("__debugadapter__/evaluate.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')
if __DebugAdapter.hooklog ~= false then
  require("__debugadapter__/log.lua") -- uses pcall
end
require("__debugadapter__/print.lua") -- uses evaluate/variables
require("__debugadapter__/entrypoints.lua") -- must be after anyone using pcall/xpcall

require("__debugadapter__/stacks.lua")

local script = script
local debug = debug
local print = print
local pairs = pairs


local sourcelabel = {
  remote = function(mod_name) return mod_name and ("remote.call from "..mod_name) or "remote.call context switch" end,
  unknown = function(mod_name) return "unknown entry point" end,
  raise_event = function(mod_name) return "raise_event from "..mod_name end,
  api = function(mod_name,extra) return (extra or "api call").." raised event from "..mod_name end,
}

local function labelframe(i,sourcename,mod_name,extra)
  return {
    id = i,
    name = (sourcelabel[sourcename] or function(mod_name) return "unkown from "..mod_name end)(mod_name,extra),
    presentationHint = "label",
    line = 0,
    column = 0,
    source = {
      name = sourcename,
      presentationHint = "deemphasize",
    }
  }
end

---@param startFrame integer | nil
---@param forRemote boolean | nil
---@return StackFrame[]
function __DebugAdapter.stackTrace(startFrame, forRemote,seq)
  local offset = 5 -- 0 getinfo, 1 stackTrace, 2 debug command, 3 debug.debug, 4 sethook callback, 5 at breakpoint
  -- in exceptions    0 getinfo, 1 stackTrace, 2 debug command, 3 debug.debug, 4 xpcall callback, 5 at exception
  -- in instrument ex 0 getinfo, 1 stackTrace, 2 debug command, 3 debug.debug, 4 on_error callback,
  --                  5 pCallWithStackTraceMessageHandler, 6 at exception
  if __DebugAdapter.instrument and not forRemote and
    debug.getinfo(4,"f").func == __DebugAdapter.on_exception then
    offset = offset + 1
  end
  local i = (startFrame or 0) + offset
  local stackFrames = {}
  while true do
    local info = debug.getinfo(i,"nSlutf")
    if not info then break end
    local framename = info.name or "(name unavailable)"
    if info.what == "main" then
      framename = "(main chunk)"
    end
    local isC = info.what == "C"
    if isC then
      if info.name == "__index" or info.name == "__newindex" then
        local t = __DebugAdapter.describe(select(2,debug.getlocal(i,1)),true)
        local k = __DebugAdapter.describe(select(2,debug.getlocal(i,2)),true)
        if info.name == "__newindex" then
          local v = __DebugAdapter.describe(select(2,debug.getlocal(i,3)),true)
          framename = ("__newindex(%s,%s,%s)"):format(t,k,v)
        else
          framename = ("__index(%s,%s)"):format(t,k)
        end
      end
    end
    if info.istailcall then
      framename = ("[tail calls...] %s"):format(framename)
    end
    if forRemote then
      framename = ("[%s] %s"):format(script.mod_name, framename)
    end
    local source = normalizeLuaSource(info.source)
    local noSource = isC or (source:sub(1,1) == "=")
    local stackFrame = {
      id = i,
      name = framename,
      line = noSource and 0 or info.currentline,
      column = noSource and 0 or 1,
      moduleId = forRemote and script.mod_name,
      presentationHint = forRemote and "subtle",
      source = {
        name = isC and "C" or source,
      }
    }
    if noSource or __DebugAdapter.isStepIgnore(info.func) then
      stackFrame.source.presentationHint = "deemphasize"
    end
    if not noSource then
      stackFrame.source.path = source
    end
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
  end

  if script then
    -- Don't bother with any of this in data stage: it's all main chunks!
    -- possible entry points (in control stage):
    --   main chunks (identified above as "(main chunk)", call sethook tags as entrypoint="main", no break on exception)
    --     control.lua init and any files it requires
    --     migrations
    --     /c __modname__ command
    --     simulation scripts (as commands)
    --   remote.call
    --     from debug enabled mod (instrumented+1/2, entrypoint="hookedremote")
    --     from non-debug enabled mod (call sethook tags as entrypoint="remote fname", no break on exception)
    --   event handlers (instrumented+1/2)
    --     if called by raise_event, has event.mod_name
    --   /command handlers (instrumented+1/2)
    --   special events: (instrumented+1/2)
    --     on_init, on_load, on_configuration_changed, on_nth_tick

    -- but first, drop frames from same-stack api calls that raise events
    local stacks = __DebugAdapter.peekStacks()
    do
      local dropextra = {
        remote = 3, -- remotestepping.call, remote.call, remotestepping.callinner
        api = 2, -- __newindex or api closure, try in raised event
      } -- default = 1 -- try in raised event or command
      local dropcount = 0
      for istack = #stacks,1,-1 do
        local stack = stacks[istack]
        if stack.mod_name == script.mod_name then
          dropcount = dropcount + table_size(stack.stack) + (dropextra[stack.source] or 1)
          print("dropstack",dropcount)
        end
      end
      if dropcount > 0 then
        print("drop",dropcount)
        for drop = 1,dropcount,1 do
          stackFrames[#stackFrames] = nil
        end
      end
    end

    local entrypoint = __DebugAdapter.getEntryPointName()
    if entrypoint then
      -- check for non-instrumented entry...
      if entrypoint == "unknown" then
        stackFrames[#stackFrames+1] = labelframe(i,"unknown")
        i = i + 1
      elseif entrypoint == "saving" or entrypoint == "main" then
        -- nothing useful to add for these...
      elseif entrypoint:match("^remote ") then
        stackFrames[#stackFrames].name = entrypoint:match("^remote (.+)$")
        stackFrames[#stackFrames+1] = labelframe(i,"remote")
        i = i + 1
      else
        -- instrumented event/remote handler has one or two extra frames.
        -- Delete them and rename the next bottom frame...
        -- this leaves a gap in `i`. Maybe later allow expanding hidden frames?
        stackFrames[#stackFrames] = nil --remoteCallInner or try_func
        if not __DebugAdapter.instrument then
          stackFrames[#stackFrames] = nil --xpcall
        end

        ---@type StackFrame
        local lastframe = stackFrames[#stackFrames]
        local info = debug.getinfo(lastframe.id,"t")

        local framename = entrypoint
        if entrypoint == "hookedremote" then
          local remoteFName = remotestepping.parentState()
          framename = remoteFName

        elseif entrypoint:match(" handler$") then

        end
        if forRemote then
          framename = ("[%s] %s"):format(script.mod_name, framename)
        end
        if not info.istailcall then
          lastframe.name = framename
        end

        -- list any eventlike api calls stacked up...
        if not forRemote and stacks then
          local nstacks = #stacks
          for istack = nstacks,1,-1 do
            local stack = stacks[istack]
            --print("stack",istack,nstacks,stack.mod_name,script.mod_name)
            stackFrames[#stackFrames+1] = labelframe(i,stack.source,stack.mod_name,stack.extra)
            i = i + 1
            for _,frame in pairs(stack.stack) do
              frame.id = i
              stackFrames[#stackFrames+1] = frame
              i = i + 1
            end
          end
        end
      end
    end
  end
  if not forRemote then
    print("DBGstack: " .. json.encode{frames=stackFrames,seq=seq})
  end
  return stackFrames
end

---@return Module[]
function __DebugAdapter.modules()
  local modules = {}
  for name,version in pairs(mods or script.active_mods) do
    modules[#modules+1] = {
      id = name, name = name,
      version = version,
    }
  end
  modules[#modules+1] = { id = "level", name = "level", }
  print("DBGmodules: " .. json.encode(modules))
end

---@param frameId number
---@return Scope[]
function __DebugAdapter.scopes(frameId)
  if debug.getinfo(frameId,"f") then
    ---@type Scope[]
    local scopes = {}
    -- Locals
    scopes[#scopes+1] = { name = "Locals", variablesReference = variables.scopeRef(frameId,"Locals"), }
    -- Upvalues
    scopes[#scopes+1] = { name = "Upvalues", variablesReference = variables.scopeRef(frameId,"Upvalues") }
    -- Factorio `global`
    if global then
      scopes[#scopes+1] = { name = "Factorio global", variablesReference = variables.tableRef(global) }
    end
    -- Lua Globals
    scopes[#scopes+1] = { name = "Lua Globals", variablesReference = variables.tableRef(_ENV) }

    print("DBGscopes: " .. json.encode({frameId = frameId, scopes = scopes}))
  else
    print("DBGscopes: " .. json.encode({frameId = frameId, scopes = {
      { name = "[Variables Currently Unavailable]", variablesReference = 0 }
    }}))
  end
end

__DebugAdapter.stepIgnoreAll(__DebugAdapter)
do
  local ininstrument = ""
  if __DebugAdapter.instrument then
    ininstrument = " in Instrument Mode"
  end

  if data then
    log("debugadapter registered for data" .. ininstrument)
    __DebugAdapter.attach()
    print("DBG: on_data")
    debug.debug()
    -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
    local reg = debug.getregistry()
    reg.__DebugAdapter = __DebugAdapter
  else
    -- in addition to the global, set up a remote so we can configure from DA's on_tick
    -- and pass stepping state around remote calls
    log("debugadapter registered for " .. script.mod_name .. ininstrument)
    remote.add_interface("__debugadapter_" .. script.mod_name ,{
      setBreakpoints = __DebugAdapter.setBreakpoints,
      remoteCallInner = remotestepping.callInner,
      remoteHasInterface = remotestepping.hasInterface,
      longVariables = __DebugAdapter.variables,
      evaluate = __DebugAdapter.evaluate,
    })

    __DebugAdapter.attach()
    print("DBG: on_parse")
    debug.debug()
  end
end

return __DebugAdapter