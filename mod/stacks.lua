local dispatch = require("__debugadapter__/dispatch.lua")
local threads = require("__debugadapter__/threads.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua") -- uses pcall
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')
local stepping = require('__debugadapter__/stepping.lua')
local remote = remote and (type(remote)=="table" and rawget(remote,"__raw")) or remote
local script = script
local debug = debug
local select = select
local __DebugAdapter = __DebugAdapter

---@class DebugAdapter.Stacks
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


---@param threadid integer
---@param startFrame integer | nil
---@param seq integer
function DAStacks.stackTrace(threadid, startFrame, seq)
  local thread = threads.active_threads[threadid]
  if script and thread.name ~= script.mod_name then
    if dispatch.canRemoteCall() and remote.interfaces["__debugadapter_"..thread.name] then
      -- redirect...
      remote.call("__debugadapter_"..thread.name, "stackTrace", threadid, startFrame, seq)
    else
      -- return empty if can't remote...
      json.response{body={},seq=seq}
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
      if __DebugAdapter.instrument and on_ex_info and on_ex_info.func == stepping.on_exception then
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
    local info = debug.getinfo(i,"nSlutfp")
    if not info then break end
    ---@type string
    local framename = info.name or "(name unavailable)"
    if info.what == "main" then
      framename = "(main chunk)"
    end
    local isC = info.what == "C"
    if isC then
      if framename == "__index" or framename == "__newindex" then
        local describe = variables.describe
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
      local entrypoint = stepping.getEntryLabel(info.func)
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
      moduleId = script and script.mod_name or nil,
    }
    if not isC then
      local dasource = {
        name = source,
        path = source,
      }
      if stepping.isStepIgnore(info.func) then
        dasource.presentationHint = "deemphasize"
      end

      stackFrame.currentpc = info.currentpc
      stackFrame.linedefined = info.linedefined

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

  json.response{body=stackFrames,seq=seq}
end

---@param frameId integer
---@prints DebugProtocol.Scope[]
function DAStacks.scopes(frameId, seq)
  local thread,i,tag = threads.splitFrameId(frameId)
  if script and thread.name ~= script.mod_name then
    if dispatch.canRemoteCall() and remote.interfaces["__debugadapter_"..thread.name] then
      -- redirect...
      remote.call("__debugadapter_"..thread.name, "scopes", frameId, seq)
    else
      -- return empty if can't remote...
      json.response{body={
        { name = "[Thread Unreachable]", variablesReference = 0, expensive=false }
      },seq=seq}
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

    json.response{seq=seq, body=scopes}
  else
    json.response{seq=seq, body={
      { name = "[No Frame]", variablesReference = 0, expensive=false }
    }}
  end
end

return DAStacks