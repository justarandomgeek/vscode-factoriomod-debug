-- force canonical name require
if ... ~= "__debugadapter__/debugadapter.lua" then
  return require("__debugadapter__/debugadapter.lua")
end

-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = __DebugAdapter or {} -- but might have been defined already for selective instrument mode
local __DebugAdapter = __DebugAdapter
local require = require
--this has to be first before requiring other files so they can mark functions as ignored
require("__debugadapter__/stepping.lua")

local variables = require("__debugadapter__/variables.lua") -- uses pcall
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local remotestepping
if script then -- don't attempt to hook in data stage
  remotestepping = require("__debugadapter__/remotestepping.lua")
end
require("__debugadapter__/evaluate.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')
require("__debugadapter__/log.lua") -- uses pcall
require("__debugadapter__/entrypoints.lua") -- must be after anyone using pcall/xpcall

local script = script
local debug = debug
local print = print
local pairs = pairs

---@param startFrame integer | nil
---@param levels integer | nil
---@param forRemote boolean | nil
---@return StackFrame[]
function __DebugAdapter.stackTrace(startFrame, levels, forRemote)
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
    if info.istailcall then
      framename = ("[tail calls...] %s"):format(framename)
    end
    if forRemote then
      framename = ("[%s] %s"):format(script.mod_name, framename)
    end
    local source = normalizeLuaSource(info.source)
    local noSource = (info.what == "C") or (source:sub(1,1) == "=")
    local stackFrame = {
      id = i,
      name = framename,
      line = noSource and 0 or info.currentline,
      column = noSource and 0 or 1,
      moduleId = forRemote and script.mod_name,
      presentationHint = forRemote and "subtle",
      source = {
        name = info.what == "C" and "C" or source,
      }
    }
    if noSource or __DebugAdapter.isStepIgnore(info.func) then
      stackFrame.source.presentationHint = "deemphasize"
    else
      stackFrame.source.path = source
    end
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
    if #stackFrames == levels then break end
  end

  if script then
    -- Don't bother with any of this in data stage: it's all main chunks!
    -- possible entry points (in control stage):
    --   main chunks (identified above as "(main chunk)", call sethook tags as entrypoint="main", no break on exception)
    --     control.lua init and any files it requires
    --     dostring(globaldump) for loading global from save
    --     migrations
    --     /c __modname__ command
    --   serpent.dump(global,{numformat="%a"}) for saving/crc check (call sethook tags as entrypoint="saving", no break on exception)
    --   remote.call
    --     from debug enabled mod (instrumented+2, entrypoint="hookedremote")
    --     from non-debug enabled mod (call sethook tags as entrypoint="remote fname", no break on exception)
    --   event handlers (instrumented+2)
    --     if called by raise_event, has event.mod_name
    --       from a debug enabled mod, has event.__debug = {stack = ...}
    --   /command handlers (instrumented+2)
    --   special events: (instrumented+2)
    --     on_init, on_load, on_configuration_changed, on_nth_tick

    local entrypoint = __DebugAdapter.getEntryPointName()
    if entrypoint then
      -- check for non-instrumented entry...
      if entrypoint == "unknown" then
        local stackFrame = {
          id = i,
          name = "unknown entry point",
          presentationHint = "label",
          line = 0,
          column = 0,
          source = {
            name = "unknown",
            presentationHint = "deemphasize",
          }
        }
        stackFrames[#stackFrames+1] = stackFrame
        i = i + 1
      elseif entrypoint == "saving" or entrypoint == "main" then
        -- nothing useful to add for these...
      elseif entrypoint:match("^remote ") then
        stackFrames[#stackFrames].name = entrypoint:match("^remote (.+)$")
        local stackFrame = {
          id = i,
          name = "remote.call context switch",
          presentationHint = "label",
          line = 0,
          column = 0,
          source = {
            name = "remote",
            presentationHint = "deemphasize",
          }
        }
        stackFrames[#stackFrames+1] = stackFrame
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
          local remoteStack,remoteFName = remotestepping.parentState()
          framename = remoteFName
          local stackFrame = {
            id = i,
            name = "remote.call context switch",
            presentationHint = "label",
            line = 0,
            column = 0,
            source = {
              name = "remote",
              presentationHint = "deemphasize",
            }
          }
          stackFrames[#stackFrames+1] = stackFrame
          i = i + 1
          for _,frame in pairs(remoteStack) do
            frame.id = i
            stackFrames[#stackFrames+1] = frame
            i = i + 1
          end
        elseif entrypoint:match(" handler$") then
          local _,event = debug.getlocal(lastframe.id,1)
          if type(event) == "table" and event.mod_name then
            local stackFrame = {
              id = i,
              name = "raise_event from " .. event.mod_name,
              presentationHint = "label",
              line = 0,
              column = 0,
              source = {
                name = "raise_event",
                presentationHint = "deemphasize",
              }
            }
            stackFrames[#stackFrames+1] = stackFrame
            i = i + 1
            if event.__debug then
              -- debug enabled mods provide a stack
              for _,frame in pairs(event.__debug.stack) do
                frame.id = i
                stackFrames[#stackFrames+1] = frame
                i = i + 1
              end
            end
          end
        end
        if forRemote then
          framename = ("[%s] %s"):format(script.mod_name, framename)
        end
        if not info.istailcall then
          lastframe.name = framename
        end
      end
    end
  end
  if not forRemote then
    print("DBGstack: " .. json.encode(stackFrames))
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
    print("DBGscopes: " .. json.encode({frameId = frameId, scopes = {}}))
  end
end

---@param expr any
---@param alsoLookIn table
function __DebugAdapter.print(expr,alsoLookIn)
  local texpr = type(expr)
  local result
  if texpr == "string" then
    result = __DebugAdapter.stringInterp(expr,3,alsoLookIn,"print")
  else
    result = __DebugAdapter.describe(expr)
  end
  local info = debug.getinfo(2,"lS")
  local body = {
    category = "console",
    output = result,
    line = info.currentline,
    source = normalizeLuaSource(info.source),
    };
  print("DBGprint: " .. json.encode(body))
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
  elseif script.mod_name ~= "debugadapter" then -- don't hook myself!
    -- in addition to the global, set up a remote so we can configure from DA's on_tick
    -- and pass stepping state around remote calls
    log("debugadapter registered for " .. script.mod_name .. ininstrument)
    remote.add_interface("__debugadapter_" .. script.mod_name ,{
      setBreakpoints = __DebugAdapter.setBreakpoints,
      remoteCallInner = remotestepping.callInner,
      remoteHasInterface = remotestepping.hasInterface
    })

    __DebugAdapter.attach()
    print("DBG: on_parse")
    debug.debug()
  end
end

return __DebugAdapter