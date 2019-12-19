local variables = require("__debugadapter__/variables.lua")

-- Set up a hook on remote.call to pass stepping state ahead of and back from
-- a remote.call into another mod. This also sets up a (nearly) transparent
-- proxy for the whole `remote` object, and demonstrates custom debug views
-- using the `__debugline` and `__debugchildren` metamethods.
-- The original `remote` LuaRemote object is available at `remote.__raw`.

local remotestepping = {}

local stacks = {}

---@return StackFrame[]
function remotestepping.parentStack()
  local level = stacks[#stacks]
  return level and level.stack
end
__DebugAdapter.stepIgnore(remotestepping.parentStack)

---@return string
function remotestepping.entryFunction()
  local level = stacks[#stacks]
  return level and level.name
end
__DebugAdapter.stepIgnore(remotestepping.entryFunction)

---@param parentstep string "remote"*("next" | "in" | "over" | "out")
---@param remoteUpStack StackFrame[]
---@param fname string
function remotestepping.stepIn(parentstep,remoteUpStack,fname)
  stacks[#stacks+1] = {
    stack = remoteUpStack,
    name = fname,
  }
  if parentstep and (parentstep == "over" or parentstep == "out" or parentstep:match("^remote")) then
    parentstep = "remote" .. parentstep
  end
  __DebugAdapter.step(parentstep,true)
end
__DebugAdapter.stepIgnore(remotestepping.stepIn)

---@return string "remote"*("next" | "in" | "over" | "out")
function remotestepping.stepOut()
  local parentstep = __DebugAdapter.currentStep()
  __DebugAdapter.step(nil,true)
  remoteStack = nil
  parentstep = parentstep and parentstep:match("^remote(.+)$") or parentstep
  return parentstep
end
__DebugAdapter.stepIgnore(remotestepping.stepOut)

local origremote = remote
local function remotestepcall(remotename,method,...)
  local debugname = "__debugadapter_"..remotename -- assume remotename is modname for now...
  local remotehasdebug = origremote.interfaces[debugname]
  if remotehasdebug then
    origremote.call(debugname,"remoteStepIn",__DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true), method)
  end
  local result = {origremote.call(remotename,method,...)}
  if remotehasdebug then
    local childstep = origremote.call(debugname,"remoteStepOut")
    __DebugAdapter.step(childstep,true)
  end
  return table.unpack(result)
end
__DebugAdapter.stepIgnore(remotestepcall)

local function remotenewindex() end
__DebugAdapter.stepIgnore(remotenewindex)

remote = {
  call = remotestepcall,
  __raw = origremote,
}
setmetatable(remote,{
  __index = origremote,
  __newindex = remotenewindex,
  __debugline = "LuaRemote Stepping Proxy",
  __debugchildren = function(t) return {
    variables.create("interfaces",origremote.interfaces),
    {
      name = "<raw>",
      value = "LuaRemote",
      type = "LuaRemote",
      variablesReference = variables.luaObjectRef(origremote,"LuaRemote"),
    },
  } end,
})

return remotestepping