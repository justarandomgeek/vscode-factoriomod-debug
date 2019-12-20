-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = {}

--this has to be first before requiring other files so they can mark functions as ignored
require("__debugadapter__/stepping.lua")

local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local remotestepping = require("__debugadapter__/remotestepping.lua")
require("__debugadapter__/evaluate.lua")

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
    if not info.name then
      if info.nparams == 1 and not info.isvararg then
        local name,event = debug.getlocal(i,1)
        if type(event) == "table" and type(event.name) == "number"
          and script.get_event_handler(event.name) == info.func then
          local evtname = ("event %d"):format(event.name)
          for k,v in pairs(defines.events) do
            if event.name == v then
              evtname = k
            end
          end
          framename = ("%s handler"):format(evtname)
        end
      elseif info.nparams == 0 and not info.isvararg and
          script.get_event_handler(defines.events.on_tick) == info.func then
        framename = "on_tick handler"
      end
    end
    if info.istailcall then
      framename = ("[tail calls...] %s"):format(framename)
    end
    if forRemote then
      framename = ("[%s] %s"):format(script.mod_name, framename)
    end
    local stackFrame = {
      id = i,
      name = framename,
      line = info.currentline,
      moduleId = forRemote and script.mod_name,
      presentationHint = forRemote and "subtle",
      source = {
        name = normalizeLuaSource(info.source),
        path = normalizeLuaSource(info.source),
      }
    }
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
    if #stackFrames == levels then break end
  end

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
  if forRemote then
    return stackFrames
  else
    print("DBGstack: " .. game.table_to_json(stackFrames))
  end
end
__DebugAdapter.stepIgnore(__DebugAdapter.stackTrace)

---@return Module[]
function __DebugAdapter.modules()
  local modules = {}
  for name,version in pairs(game.active_mods) do
    modules[#modules+1] = {
      id = name, name = name,
      version = version,
    }
  end
  modules[#modules+1] = { id = "level", name = "level", }
  print("DBGmodules: " .. game.table_to_json(modules))
end

---@param frameId number
---@return Scope[]
function __DebugAdapter.scopes(frameId)
  if debug.getinfo(frameId,"f") then
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      -- Global
      { name = "Globals", variablesReference = variables.tableRef(_ENV) },
      -- Locals
      { name = "Locals", variablesReference = variables.scopeRef(frameId,"Locals") },
      -- Upvalues
      { name = "Upvalues", variablesReference = variables.scopeRef(frameId,"Upvalues") },
    }}))
  else
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      { name = "Remote Variables Unavailable", variablesReference = 0 },
    }}))
  end
end

-- don't hook myself!
if script.mod_name ~= "debugadapter" then
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
end

return __DebugAdapter