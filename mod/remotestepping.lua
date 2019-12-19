local variables = require("__debugadapter__/variables.lua")

-- Set up a hook on remote.call to pass stepping state ahead of and back from
-- a remote.call into another mod. This also sets up a (nearly) transparent
-- proxy for the whole `remote` object, and demonstrates custom debug views
-- using the `__debugline` and `__debugchildren` metamethods.
-- The original `remote` LuaRemote object is available at `remote.__raw`.

local remotestepping = {}

local origremote = remote
local stacks = {}
local myRemotes = {}

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
  stacks[#stacks] = nil
  parentstep = parentstep and parentstep:match("^remote(.+)$") or parentstep
  return parentstep
end
__DebugAdapter.stepIgnore(remotestepping.stepOut)

local function remotestepcall(remotename,method,...)
  -- if whois doesn't know who owns it, they must not have debug registered...
  local debugname = origremote.call("debugadapter","whois",remotename)
  if debugname then
    debugname = "__debugadapter_" .. debugname
    origremote.call(debugname,"remoteStepIn",__DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true), method)
  end
  local result = {origremote.call(remotename,method,...)}
  if debugname then
    local childstep = origremote.call(debugname,"remoteStepOut")
    __DebugAdapter.step(childstep,true)
  end
  return table.unpack(result)
end
__DebugAdapter.stepIgnore(remotestepcall)


function remotestepping.interfaces()
  return myRemotes
end
__DebugAdapter.stepIgnore(remotestepping.interfaces)

local function remotestepadd(remotename,funcs)
  myRemotes[remotename] = true
  origremote.add_interface(remotename,funcs)
end
__DebugAdapter.stepIgnore(remotestepadd)

local function remotestepremove(remotename)
  myRemotes[remotename] = nil
  return origremote.remove_interface(remotename)
end
__DebugAdapter.stepIgnore(remotestepremove)

local function remotenewindex() end
__DebugAdapter.stepIgnore(remotenewindex)

local newremote = {
  call = remotestepcall,
  add_interface = remotestepadd,
  remove_interface = remotestepremove,
  __raw = origremote,
}
setmetatable(newremote,{
  __index = origremote,
  __newindex = remotenewindex,
  __debugline = "LuaRemote Stepping Proxy",
  __debugchildren = function(t) return {
    variables.create([["interfaces"]],origremote.interfaces),
    variables.create("<raw>",origremote),
    {
      name = "<stacks>",
      value = "<stacks>",
      type = "StackFrame[]",
      variablesReference = variables.tableRef(stacks),
    },
    {
      name = "<myRemotes>",
      value = "<myRemotes>",
      type = "keys",
      variablesReference = variables.tableRef(myRemotes),
    },
  } end,
})

if script.mod_name ~= "debugadapter" then
  remote = newremote
end

return remotestepping