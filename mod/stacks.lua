local json = require('__debugadapter__/json.lua')
local threads = require("__debugadapter__/threads.lua")
local dispatch = require("__debugadapter__/dispatch.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local variables = require("__debugadapter__/variables.lua")
local stepping = require('__debugadapter__/stepping.lua')
local script = (type(script)=="table" and rawget(script,"__raw")) or script
local debug = debug
local debugprompt = debug.debug
local dgetinfo = debug.getinfo
local dgetupvalue = debug.getupvalue
local dgetlocal = debug.getlocal
local string = string
local ssub = string.sub
local smatch = string.match
local select = select
local next = next
local type = type

local remote = (type(remote)=="table" and rawget(remote,"__raw")) or remote
local rcallptr = remote and select(2, dgetupvalue(remote.call, 2))

local threadid = threads.this_thread

local env = _ENV
local _ENV = nil

---@class DebugAdapter.Stacks
local DAStacks = {}

local function labelframe(i, tag, name)
  return {
    id = threadid*1024 + i*4 + tag,
    name = name,
    presentationHint = "label",
  }
end


---@param threadid integer
---@param startFrame integer | nil
---@param seq integer
function DAStacks.stackTrace(threadid, startFrame, seq)
  if not dispatch.callThread(threadid, "stackTrace", startFrame, seq) then
    -- return empty if can't call...
    json.response{body={},seq=seq}
  end
end
function dispatch.__inner.stackTrace(startFrame, seq)
  local offset = 7
  -- 0 getinfo, 1 stackTrace, 2 callThread, 3 stackTrace, 4 debug command, 5 debug.debug,
  -- in normal stepping:                       6 sethook callback, 7 at breakpoint
  -- in exception (instrument only)            6 on_error callback, 7 pCallWithStackTraceMessageHandler, 8 at exception
  -- in remote-redirected call:                2 unhook, 3 at stack
  do
    local atprompt = dgetinfo(5,"f")
    if atprompt and atprompt.func == debugprompt then
      local on_ex_info = dgetinfo(6,"f")
      if on_ex_info and on_ex_info.func == stepping.on_exception then
        offset = offset + 1
      end
    else
      offset = 3 -- redirected call
    end
  end


  local i = (startFrame or 0) + offset
  ---@type DebugProtocol.StackFrame[]
  local stackFrames = {}
  while true do
    local info = dgetinfo(i,"nSlutfp")
    if not info then break end
    ---@type string
    local framename = info.name or "(name unavailable)"
    if info.what == "main" then
      framename = "(main chunk)"
    end
    local isC = info.what == "C"
    if isC then
      if info.nups == 3 then
        local _,obj = dgetupvalue(info.func, 3)
        if obj == remote then
          local _,method = dgetupvalue(info.func, 2)
          if method == rcallptr then
            local _,interface = dgetlocal(i, 1)
            local _,func = dgetlocal(i, 2)
            framename = "[remote to "..interface.."::"..func.."]"
          end
        end
      end
    elseif script and framename == "(name unavailable)" then
      local entrypoint = stepping.getEntryLabel(info.func)
      if entrypoint then
        framename = entrypoint
      end
    end
    local source = normalizeLuaSource(info.source)
    local sourceIsCode = source == "=(dostring)"
    local noLuaSource = (not sourceIsCode) and ssub(source,1,1) == "="
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
      if stepping.isStepIgnore(info.func) or smatch(source, "^@__debugadapter__") then
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
    if info.istailcall then
      stackFrames[#stackFrames+1] = labelframe(i, 1, "[tail calls...]")
    end
    i = i + 1
  end

  if not next(stackFrames) then
    stackFrames[1] = labelframe(i, 1, "[no active calls]")
  end

  json.response{body=stackFrames,seq=seq}
end


---@param frameId integer
---@param seq integer
function DAStacks.scopes(frameId, seq)
  if not dispatch.callFrame(frameId, "scopes", seq) then
    -- return empty if can't call...
    json.response{body={
      { name = "[Thread Unreachable]", variablesReference = 0, expensive=false }
    },seq=seq}
  end
end

---@param i integer
---@param tag integer
---@param seq integer
function dispatch.__inner.scopes(i, tag, seq)
  local hasframe = tag == 0 and debug.getinfo(i,"f")
  local globalonly = tag == 1
  if hasframe or globalonly then
    ---@type DebugProtocol.Scope[]
    local scopes = {}
    if hasframe then
      -- Locals
      scopes[#scopes+1] = { name = "Locals", variablesReference = variables.scopeRef(i,"Locals"), expensive=false }
      -- Upvalues
      scopes[#scopes+1] = { name = "Upvalues", variablesReference = variables.scopeRef(i,"Upvalues"), expensive=false }
    end
    -- Factorio `storage`
    if type(env.storage) == "table" then
      scopes[#scopes+1] = { name = "Storage", variablesReference = variables.tableRef(env.storage), expensive=false }
    end
    -- Lua Globals
    scopes[#scopes+1] = { name = "Globals", variablesReference = variables.tableRef(env), expensive=false }

    json.response{seq=seq, body=scopes}
  else
    json.response{seq=seq, body={
      { name = "[No Frame]", variablesReference = 0, expensive=false }
    }}
  end
end

return DAStacks