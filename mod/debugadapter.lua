-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = {}
local __DebugAdapter = __DebugAdapter
local require = require
--this has to be first before requiring other files so they can mark functions as ignored
require("__debugadapter__/stepping.lua")

local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local remotestepping
if script then -- don't attempt to hook in data stage
  remotestepping = require("__debugadapter__/remotestepping.lua")
end
require("__debugadapter__/evaluate.lua")
local json = require('__debugadapter__/json.lua')

local script = script
local defines = defines
local debug = debug
local type = type
local print = print
local pairs = pairs
local devents = defines.events
local deon_tick = devents.on_tick

---@param startFrame integer | nil
---@param levels integer | nil
---@param forRemote boolean | nil
---@return StackFrame[]
function __DebugAdapter.stackTrace(startFrame, levels, forRemote)
  local offset = 5 -- 0 is getinfo, 1 is stackTrace, 2 is debug command, 3 is debug.debug, 4 is sethook callback, 5 is at breakpoint
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
    local stackFrame = {
      id = i,
      name = framename,
      line = info.currentline,
      moduleId = forRemote and script.mod_name,
      presentationHint = forRemote and "subtle",
      source = {
        name = source,
        path = source,
      }
    }
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
    if #stackFrames == levels then break end
  end

  local remoteStack,remoteFName
  if remotestepping then
    -- read state for instrumented remote calls
    remoteStack,remoteFName = remotestepping.parentState()
    if remoteStack then
      -- in an instrumented remote.call, there's an extra frame for remotestepping.callInner and one for xpcall.
      -- delete the extras, rename the remote function, and then copy the parent stack over...
      -- this leaves a gap in `i`. Maybe later allow expanding hidden frames?
      stackFrames[#stackFrames] = nil
      stackFrames[#stackFrames] = nil
      if forRemote then
        stackFrames[#stackFrames].name = ("[%s] %s"):format(script.mod_name, remoteFName)
      else
        stackFrames[#stackFrames].name = remoteFName
      end
      for _,frame in pairs(remoteStack) do
        frame.id = i
        stackFrames[#stackFrames+1] = frame
        i = i + 1
      end
    else
      -- check for non-instrumeted remote calls...
      local id = stackFrames[#stackFrames].id
      local info = debug.getinfo(id,"f")
      remoteFname = remotestepping.isRemote(info.func)
      if remoteFName then
        if forRemote then
          stackFrames[#stackFrames].name = ("[%s] %s"):format(script.mod_name, remoteFName)
        else
          stackFrames[#stackFrames].name = remoteFName
        end
      end
    end
  end
  if script and not remoteFName then
    -- Try to identify the entry point, if it wasn't a remote.call (identified above)
    -- other possible entry points (in control stage):
    --   main chunks (identified above as "(main chunk)")
    --     control.lua init and any files it requires
    --     dostring(globaldump) for loading global from save (no break)
    --     migrations
    --     /c __modname__ command
    --   serpent.dump(global,{numformat="%a"}) for saving/crc check (no break)
    --   event handlers (identify by event table, verify with get_event_handler)
    --   /command handlers (identify by event table)
    --   special events:
    --     on_init (not identifiable yet)
    --     on_load (script and not game and not mainchunk)
    --     on_configuration_changed (identify by event table)
    --     on_nth_tick (identify by event table)

    ---@type StackFrame
    local lastframe = stackFrames[#stackFrames]
    local framename = lastframe.name
    local id = lastframe.id
    local info = debug.getinfo(id,"Sutf")
    if info.what ~= "main" then
      if not game then
        framename = "on_load handler"
      elseif not info.vararg then
        if info.nparams == 1 then
          local name,event = debug.getlocal(id,1)
          if type(event) == "table" and debug.getmetatable(event) == nil then
            local eventid = event.name
            if type(eventid) == "number" and script.get_event_handler(eventid) == info.func then
              local evtname = ("event %d"):format(eventid)
              local input_name = event.input_name
              if type(input_name) == "string" then
                -- custom-input
                evtname = input_name
              else
                -- normal game events
                for k,v in pairs(devents) do
                  if eventid == v then
                    evtname = k
                    break
                  end
                end
              end
              framename = ("%s handler"):format(evtname)
            elseif type(eventid) == "string" then
              -- commands from LuaCommandProcessor
              framename = ("command /%s"):format(eventid)
            else
              local nth = event.nth_tick
              if type(nth) == "number" then
                framename = ("on_nth_tick handler %d"):format(nth)
              elseif type(event.mod_changes) == "table" and type(event.mod_startup_settings_changed) == "boolean"
                and type(event.migration_applied) == "boolean" then
                  framename = "on_configuration_changed handler"
              end
            end
          end
        elseif info.nparams == 0 and script.get_event_handler(deon_tick) == info.func then
          framename = "on_tick handler"
        end
      end
      if info.istailcall then
        framename = ("[tail calls...] %s"):format(framename)
      end
      if forRemote then
        framename = ("[%s] %s"):format(script.mod_name, framename)
      end
      lastframe.name = framename
    end
  end
  if not forRemote then
    print("DBGstack: " .. json.encode(stackFrames))
  end
  return stackFrames
end
__DebugAdapter.stepIgnore(__DebugAdapter.stackTrace)

---@return Module[]
function __DebugAdapter.modules()
  local modules = {}
  for name,version in pairs(mods or game.active_mods) do
    modules[#modules+1] = {
      id = name, name = name,
      version = version,
    }
  end
  modules[#modules+1] = { id = "level", name = "level", }
  print("DBGmodules: " .. json.encode(modules))
end
__DebugAdapter.stepIgnore(__DebugAdapter.modules)

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
__DebugAdapter.stepIgnore(__DebugAdapter.scopes)

---@param expr string
---@param alsoLookIn table
function __DebugAdapter.print(expr,alsoLookIn)
  local result = __DebugAdapter.stringInterp(expr,3,alsoLookIn,"print")
  local body = {
    category = "console",
    output = result,
  };
  if game or mods then
    local info = debug.getinfo(2,"lS")
    body.line = info.currentline
    body.source = normalizeLuaSource(info.source)
  end
  print("DBGprint: " .. json.encode(body))
end
__DebugAdapter.stepIgnore(__DebugAdapter.print)

if data then
  log("debugadapter registered for data")
  __DebugAdapter.attach()
  print("DBG: on_data")
  debug.debug()
elseif script.mod_name ~= "debugadapter" then -- don't hook myself!
  -- in addition to the global, set up a remote so we can attach/detach/configure from DA's on_tick
  -- and pass stepping state around remote calls
  log("debugadapter registered for " .. script.mod_name)
  remote.add_interface("__debugadapter_" .. script.mod_name ,{
    attach = __DebugAdapter.attach,
    detach = __DebugAdapter.detach,
    setBreakpoints = __DebugAdapter.setBreakpoints,
    remoteCallInner = remotestepping.callInner,
    remoteHasInterface = remotestepping.hasInterface
  })

  __DebugAdapter.attach()
  print("DBG: on_parse")
  debug.debug()
end

return __DebugAdapter