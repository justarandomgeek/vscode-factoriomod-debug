---@class cross_stack
---@field source string What caused this stack to be recorded
---@field extra any An extra label frame to add when printing stack traces
---@field mod_name string The mod name this stack came from
---@field stack StackFrame[] pre-prepared stack frames

---@type cross_stack[]
local stacks = {}
---@type number
local cross_stepping
---@type boolean
local cross_step_instr

local remote = remote and rawget(remote,"__raw") or remote

---@param stack cross_stack
---@param stepping number
---@param step_instr boolean
function __DebugAdapter.pushStack(stack,stepping,step_instr)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "pushStack", stack,stepping,step_instr)
  else
    stacks[#stacks+1] = stack
    cross_stepping = stepping
    cross_step_instr = step_instr
  end
end

---@return number stepping
---@return boolean step_instr
function __DebugAdapter.popStack()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "popStack")
  else
    stacks[#stacks] = nil
    local stepping,step_instr = cross_stepping, cross_step_instr
    cross_stepping,cross_step_instr = nil,nil

    return stepping,step_instr
  end
end

---@return cross_stack[]
function __DebugAdapter.peekStacks()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStacks")
  else
    return stacks
  end
end

---@param stepping string
---@param step_instr boolean
---@return nil
function __DebugAdapter.crossStepping(stepping,step_instr)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "crossStepping", stepping)
  else
    cross_stepping = stepping
    cross_step_instr = step_instr
  end
end

---@return number cross_stepping
---@return boolean cross_step_instr
function __DebugAdapter.peekStepping()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStepping")
  else
    return cross_stepping,cross_step_instr
  end
end