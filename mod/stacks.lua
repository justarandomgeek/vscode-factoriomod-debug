---@class cross_stack
---@field source string What caused this stack to be recorded
---@field extra any An extra label frame to add when printing stack traces
---@field mod_name string The mod name this stack came from
---@field stack StackFrame[] pre-prepared stack frames

---@type cross_stack[]
local stacks = {}
---@type number
local cross_stepping

local remote = remote and rawget(remote,"__raw") or remote

---@param stack cross_stack
---@param stepping number
function __DebugAdapter.pushStack(stack,stepping)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "pushStack", stack,stepping)
  else
    stacks[#stacks+1] = stack
    cross_stepping = stepping
  end
end

---@return string
function __DebugAdapter.popStack()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "popStack")
  else
    stacks[#stacks] = nil
    local stepping = cross_stepping
    cross_stepping = nil
    return stepping
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
---@return nil
function __DebugAdapter.crossStepping(stepping)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "crossStepping", stepping)
  else
    cross_stepping = stepping
  end
end

---@return string
function __DebugAdapter.peekStepping()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStepping")
  else
    return cross_stepping
  end
end