
local stacks = {}
local cross_stepping

local remote = remote and rawget(remote,"__raw") or remote

function __DebugAdapter.pushStack(stack,stepping)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "pushStack", stack,stepping)
  else
    stacks[#stacks+1] = stack
    cross_stepping = stepping
  end
end

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

function __DebugAdapter.peekStacks()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStacks")
  else
    return stacks
  end
end

function __DebugAdapter.crossStepping(stepping)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "crossStepping", stepping)
  else
    cross_stepping = stepping
  end
end

function __DebugAdapter.peekStepping()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStepping")
  else
    return cross_stepping
  end
end