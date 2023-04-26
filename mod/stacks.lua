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

---@param startFrame integer | nil
---@param forRemote boolean | nil
---@return DebugProtocol.StackFrame[]
function DAStacks.stackTrace(startFrame, forRemote, seq)
  local offset = 5 -- 0 getinfo, 1 stackTrace, 2 debug command, 3 debug.debug,
  -- in normal stepping:                       4 sethook callback, 5 at breakpoint
  -- in exception (instrument only)            4 on_error callback, 5 pCallWithStackTraceMessageHandler, 6 at exception
  if __DebugAdapter.instrument and not forRemote and
    debug.getinfo(4,"f").func == __DebugAdapter.on_exception then
    offset = offset + 1
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
    end
    if info.istailcall then
      framename = ("[tail calls...] %s"):format(framename)
    end
    if forRemote then
      framename = ("[%s] %s"):format(script.mod_name, framename)
    end
    local source = normalizeLuaSource(info.source)
    local sourceIsCode = source == "=(dostring)"
    local noLuaSource = (not sourceIsCode) and source:sub(1,1) == "="
    local noSource = isC or noLuaSource
    ---@type DebugProtocol.StackFrame
    local stackFrame = {
      id = i,
      name = framename,
      line = noSource and 0 or info.currentline,
      column = noSource and 0 or 1,
      moduleId = forRemote and script.mod_name or nil,
      presentationHint = forRemote and "subtle" or nil,
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

  if script then
    -- Don't bother with any of this in data stage: it's all main chunks!
    -- possible entry points (in control stage):
    --   main chunks (identified above as "(main chunk)")
    --     control.lua init and any files it requires
    --     migrations
    --     /c __modname__ command
    --     simulation scripts (as commands)
    --   remote.call
    --   event handlers
    --     if called by raise_event, has event.mod_name
    --   /command handlers
    --   special events:
    --     on_init, on_load, on_configuration_changed, on_nth_tick

    -- but first, drop frames from same-stack api calls that raise events
    local stacks = __DebugAdapter.peekStacks()
    do
      local dropcount = 0
      for istack = #stacks,1,-1 do
        local stack = stacks[istack]
        if stack.mod_name == script.mod_name then
          -- drop the listed frames plus the __newindex or api closure
          dropcount = dropcount + table_size(stack.stack) + 1
        end
      end
      if dropcount > 0 then
        for drop = 1,dropcount,1 do
          stackFrames[#stackFrames] = nil
        end
      end
    end

    -- try to improve the label on the entrypoint
    do
      local lastframe = stackFrames[#stackFrames]
      if lastframe then
        local info = debug.getinfo(lastframe.id,"f")
        local entrypoint = __DebugAdapter.getEntryLabel(info.func)
        if entrypoint then
          local framename = entrypoint
          if forRemote then
            framename = ("[%s] %s"):format(script.mod_name, framename)
          end
          lastframe.name = framename
        end
      end
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
  if not forRemote then
    print("\xEF\xB7\x96" .. json.encode{body=stackFrames,seq=seq})
  end
  return stackFrames
end

---@class cross_stack
---@field source string What caused this stack to be recorded
---@field extra any An extra label frame to add when printing stack traces
---@field mod_name string The mod name this stack came from
---@field stack DebugProtocol.StackFrame[] pre-prepared stack frames

---@type cross_stack[]
local stacks = {}
---@type number?
local cross_stepping
---@type boolean?
local cross_step_instr

---@param stack cross_stack
---@param stepping? number
---@param step_instr? boolean
function DAStacks.pushStack(stack,stepping,step_instr)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "pushStack", stack,stepping,step_instr)
  else
    stacks[#stacks+1] = stack
    cross_stepping = stepping
    cross_step_instr = step_instr
  end
end

---@return number? stepping
---@return boolean? step_instr
function DAStacks.popStack()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call--[[@as fun(string,string):number?,boolean?]]("debugadapter", "popStack")
  else
    stacks[#stacks] = nil
    local stepping,step_instr = cross_stepping, cross_step_instr
    cross_stepping,cross_step_instr = nil,nil

    return stepping,step_instr
  end
end

---@return cross_stack[]
function DAStacks.peekStacks()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStacks") --[[@as (cross_stack[])]]
  else
    return stacks
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