local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua") -- uses pcall
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')
local remote = remote and (type(remote)=="table" and rawget(remote,"__raw")) or remote
local script = script
local debug = debug
local print = print
local pairs = pairs
local select = select
local table_size = table_size
local __DebugAdapter = __DebugAdapter

---@class DebugAdapter.Stacks
---@field this_thread integer
local DAStacks = {}

local sourcelabel = {
  api = function(mod_name,extra) return (extra or "api call").." from "..mod_name end,
}

local function labelframe(i,sourcename,mod_name,extra)
  return {
    id = i,
    name = (sourcelabel[sourcename] or function(mod_name) return "unkown from "..mod_name end)(mod_name,extra),
    presentationHint = "label",
  }
end

---@type DebugProtocol.Thread[]
local threads
do
  if not script then
    threads = {
      { id = 1, name = "data", },
    }
    DAStacks.this_thread = 1
  elseif script.level.is_simulation then
    threads = {
      { id = 1, name = "simulation", },
    }
    DAStacks.this_thread = 1
  else
    threads = {
      { id = 1, name = "level", },
    }
    if script.mod_name == "level" then
      DAStacks.this_thread = 1
    end
    for name in pairs(script.active_mods) do
      local i = #threads + 1
      threads[i] = { id = i, name = name, }
      if name == script.mod_name then
        DAStacks.this_thread = i
      end
    end
  end
end

---@param seq number
function DAStacks.threads(seq)
  print("\xEF\xB7\x96" .. json.encode{body={threads=threads},seq=seq})
end

---@param threadid integer
---@param startFrame integer | nil
---@param seq integer
function DAStacks.stackTrace(threadid, startFrame, seq)
  local thread = threads[threadid]
  if thread.name ~= script.mod_name then
    if __DebugAdapter.canRemoteCall() and remote.interfaces["__debugadapter_"..thread.name] then
      -- redirect...
      remote.call("__debugadapter_"..thread.name, "stackTrace", threadid, startFrame, seq)
    else
      -- return empty if can't remote...
      print("\xEF\xB7\x96" .. json.encode{body={},seq=seq})
    end
    return
  end

  local offset = 5 -- 0 getinfo, 1 stackTrace, 2 debug command, 3 debug.debug,
  -- in normal stepping:                       4 sethook callback, 5 at breakpoint
  -- in exception (instrument only)            4 on_error callback, 5 pCallWithStackTraceMessageHandler, 6 at exception
  -- in remote-redirected call:                2 at stack
  do
    local atprompt = debug.getinfo(3,"f")
    if atprompt and atprompt.func == debug.debug then
      local on_ex_info = debug.getinfo(4,"f")
      if __DebugAdapter.instrument and on_ex_info and on_ex_info.func == __DebugAdapter.on_exception then
        offset = offset + 1
      end
    else
      offset = 2 -- redirected call
    end
  end


  local i = (startFrame or 0) + offset
  ---@type DebugProtocol.StackFrame[]
  local stackFrames = {}
  while true do
    local info = debug.getinfo(i,"nSlutf")
    if not info then break end
    ---@type string
    local framename = info.name or "(name unavailable)"
    if info.what == "main" then
      framename = "(main chunk)"
    end
    local isC = info.what == "C"
    if isC then
      if framename == "__index" or framename == "__newindex" then
        local describe = __DebugAdapter.describe
        local t = describe(select(2,debug.getlocal(i,1)),true)
        local k = describe(select(2,debug.getlocal(i,2)),true)
        if framename == "__newindex" then
          local v = describe(select(2,debug.getlocal(i,3)),true)
          framename = ("__newindex(%s,%s,%s)"):format(t,k,v)
        else
          framename = ("__index(%s,%s)"):format(t,k)
        end
      end
    elseif script and framename == "(name unavailable)" then
      local entrypoint = __DebugAdapter.getEntryLabel(info.func)
      if entrypoint then
        framename = entrypoint
      end
    end
    if info.istailcall then
      framename = ("[tail calls...] %s"):format(framename)
    end
    local source = normalizeLuaSource(info.source)
    local sourceIsCode = source == "=(dostring)"
    local noLuaSource = (not sourceIsCode) and source:sub(1,1) == "="
    local noSource = isC or noLuaSource
    ---@type DebugProtocol.StackFrame
    local stackFrame = {
      id = threadid*1024 + i*4,
      name = framename,
      line = noSource and 0 or info.currentline,
      column = noSource and 0 or 1,
      moduleId = script.mod_name,
    }
    if not isC then
      local dasource = {
        name = source,
        path = source,
      }
      if __DebugAdapter.isStepIgnore(info.func) then
        dasource.presentationHint = "deemphasize"
      end

      if __DebugAdapter.hascurrentpc then
        stackFrame.currentpc = debug.getinfo(i,"p").currentpc
        stackFrame.linedefined = info.linedefined
      end

      if sourceIsCode then
        local sourceref = variables.sourceRef(info.source)
        if sourceref then
          dasource = sourceref
        end
      end
      stackFrame.source = dasource
    end
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
  end

  print("\xEF\xB7\x96" .. json.encode{body=stackFrames,seq=seq})
end

---@param frameId integer
---@return DebugProtocol.Thread thread
---@return integer frameId
---@return integer tag
function DAStacks.splitFrameId(frameId)
  local threadid = math.floor(frameId/1024)
  local thread = threads[threadid]
  local i = math.floor((frameId % 1024) / 4)
  local tag = frameId % 4
  return thread,i,tag
end

---@param frameId integer
---@prints DebugProtocol.Scope[]
function DAStacks.scopes(frameId, seq)
  local thread,i,tag = DAStacks.splitFrameId(frameId)
  if thread.name ~= script.mod_name then
    if __DebugAdapter.canRemoteCall() and remote.interfaces["__debugadapter_"..thread.name] then
      -- redirect...
      remote.call("__debugadapter_"..thread.name, "scopes", frameId, seq)
    else
      -- return empty if can't remote...
      print("\xEF\xB7\x96" .. json.encode{body={
        { name = "[Thread Unreachable]", variablesReference = 0, expensive=false }
      },seq=seq})
    end
    return
  end

  if tag == 0 and debug.getinfo(i,"f") then
    ---@type DebugProtocol.Scope[]
    local scopes = {}
    -- Locals
    scopes[#scopes+1] = { name = "Locals", variablesReference = variables.scopeRef(i,"Locals"), expensive=false }
    -- Upvalues
    scopes[#scopes+1] = { name = "Upvalues", variablesReference = variables.scopeRef(i,"Upvalues"), expensive=false }
    -- Factorio `global`
    if global then
      scopes[#scopes+1] = { name = "Factorio global", variablesReference = variables.tableRef(global), expensive=false }
    end
    -- Lua Globals
    scopes[#scopes+1] = { name = "Lua Globals", variablesReference = variables.tableRef(_ENV), expensive=false }

    print("\xEF\xB7\x96" .. json.encode({seq=seq, body=scopes}))
  else
    print("\xEF\xB7\x96" .. json.encode({seq=seq, body={
      { name = "[No Frame]", variablesReference = 0, expensive=false }
    }}))
  end
end

---@type number?
local cross_stepping
---@type boolean?
local cross_step_instr

---@return number? stepping
---@return boolean? step_instr
function DAStacks.takeStepping()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call--[[@as fun(string,string):number?,boolean?]]("debugadapter", "takeStepping")
  else
    local stepping,step_instr = cross_stepping, cross_step_instr
    cross_stepping,cross_step_instr = nil,nil

    return stepping,step_instr
  end
end


---@param stepping? number
---@param step_instr? boolean
function DAStacks.crossStepping(stepping,step_instr)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "crossStepping", stepping)
  else
    cross_stepping = stepping
    cross_step_instr = step_instr
  end
end

---@return number? cross_stepping
---@return boolean? cross_step_instr
function DAStacks.peekStepping()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call--[[@as fun(string,string):number?,boolean?]]("debugadapter", "peekStepping")
  else
    return cross_stepping,cross_step_instr
  end
end

return DAStacks