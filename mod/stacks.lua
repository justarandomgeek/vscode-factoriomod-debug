
local stacks = {}

local remote = remote and rawget(remote,"__raw") or remote

function __DebugAdapter.pushStack(stack)
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "pushStack", stack)
  else
    stacks[#stacks+1] = stack
  end
end

function __DebugAdapter.popStack()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "popStack")
  else
    stacks[#stacks] = nil
  end
end

function __DebugAdapter.peekStacks()
  if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    return remote.call("debugadapter", "peekStacks")
  else
    return stacks
  end
end