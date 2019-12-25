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
    elseif not info.name and script then
      if info.nparams == 1 and not info.isvararg then
        local name,event = debug.getlocal(i,1)
        if type(event) == "table" then
          local eventid = event.name
          if type(eventid) == "number" and script.get_event_handler(eventid) == info.func then
            local evtname = ("event %d"):format(eventid)
            for k,v in pairs(devents) do
              if eventid == v then
                evtname = k
              end
            end
            framename = ("%s handler"):format(evtname)
          end
        end
      elseif info.nparams == 0 and not info.isvararg and
          script.get_event_handler(deon_tick) == info.func then
        framename = "on_tick handler"
      end
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

  if remotestepping then
    local remoteStack = remotestepping.parentStack()
    if remoteStack then
      local remoteFName = remotestepping.entryFunction()
      if remoteFName then
        if forRemote then
          stackFrames[#stackFrames].name = ("[%s] %s"):format(script.mod_name, remoteFName)
        else
          stackFrames[#stackFrames].name = remoteFName
        end
      end
      for _,frame in pairs(remoteStack) do
        frame.id = i
        stackFrames[#stackFrames+1] = frame
        i = i + 1
      end
    end
  end
  if forRemote then
    return stackFrames
  else
    print("DBGstack: " .. json.encode(stackFrames))
  end
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

---@param frameId number
---@return Scope[]
function __DebugAdapter.scopes(frameId)
  if debug.getinfo(frameId,"f") then
    local scopes = {}
    -- Global
    scopes[#scopes+1] = { name = "Lua Globals", variablesReference = variables.tableRef(_ENV) }
    if global then
      scopes[#scopes+1] = { name = "Factorio global", variablesReference = variables.tableRef(global) }
    end
    -- Locals
    scopes[#scopes+1] = { name = "Locals", variablesReference = variables.scopeRef(frameId,"Locals") }
    -- Upvalues
    scopes[#scopes+1] = { name = "Upvalues", variablesReference = variables.scopeRef(frameId,"Upvalues") }


    print("DBGscopes: " .. json.encode({frameId = frameId, scopes = scopes}))
  else
    print("DBGscopes: " .. json.encode({frameId = frameId, scopes = {
      { name = "Remote Variables Unavailable", variablesReference = 0 },
    }}))
  end
end

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
    remoteStepIn = remotestepping.stepIn,
    remoteStepOut = remotestepping.stepOut,
    remoteStepInterfaces = remotestepping.interfaces
  })

  --TODO: attach on init setting?
  __DebugAdapter.attach()
  print("DBG: on_parse")
  debug.debug()
end

return __DebugAdapter