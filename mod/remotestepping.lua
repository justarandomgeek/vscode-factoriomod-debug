local variables = require("__debugadapter__/variables.lua")

-- Set up a hook on remote.call to pass stepping state ahead of and back from
-- a remote.call into another mod. This also sets up a (nearly) transparent
-- proxy for the whole `remote` object, and demonstrates custom debug views
-- using the `__debugline` and `__debugchildren` metamethods.
-- The original `remote` LuaRemote object is available at `remote.__raw`.

local remotestepping = {}

local __DebugAdapter = __DebugAdapter
local script = script
local setmetatable = setmetatable
local unpack = table.unpack

---@type LuaRemote
local origremote = remote
local stacks = {}
local myRemotes = {}

---@return StackFrame[]
---@return string
function remotestepping.parentState()
  local level = stacks[#stacks]
  if level then
    return level.stack, level.name
  end
end
__DebugAdapter.stepIgnore(remotestepping.parentState)

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
  local call = origremote.call
  if not game then -- remove this in 0.18 with script.active_mods
    -- if game isn't ready we can't prepare stack traces yet, so just call directly...
    return call(remotename,method,...)
  end
  -- if whois doesn't know who owns it, they must not have debug registered...
  local debugname = call("debugadapter","whois",remotename)
  if debugname then
    debugname = "__debugadapter_" .. debugname
    call(debugname,"remoteStepIn",__DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true), method)
  end
  local result = {call(remotename,method,...)}
  if debugname then
    local childstep = call(debugname,"remoteStepOut")
    __DebugAdapter.step(childstep,true)
  end
  return unpack(result)
end
__DebugAdapter.stepIgnore(remotestepcall)


function remotestepping.interfaces()
  local interfaces = {}
  for name in pairs(myRemotes) do
    interfaces[name] = true
  end
  return interfaces
end
__DebugAdapter.stepIgnore(remotestepping.interfaces)

function remotestepping.isRemote(func)
  -- it would be nice to pre-calculate all this, but changing the functions in a
  -- remote table at runtime is actually valid, so an old result may not be correct!
  for name,interface in pairs(myRemotes) do
    for fname,f in pairs(interface) do
      if f == func then
        return fname,name
      end
    end
  end
end
__DebugAdapter.stepIgnore(remotestepping.isRemote)

local function remotestepadd(remotename,funcs,...)
  myRemotes[remotename] = funcs
  return origremote.add_interface(remotename,funcs,...)
end
__DebugAdapter.stepIgnore(remotestepadd)

local function remotestepremove(remotename,...)
  myRemotes[remotename] = nil
  return origremote.remove_interface(remotename,...)
end
__DebugAdapter.stepIgnore(remotestepremove)

local function remotenewindex() end
__DebugAdapter.stepIgnore(remotenewindex)

local function remotedebugchildren(t)
  return {
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
  }
end
__DebugAdapter.stepIgnore(remotedebugchildren)

local newremote = {
  call = remotestepcall,
  add_interface = remotestepadd,
  remove_interface = remotestepremove,
  __raw = origremote,
}
setmetatable(newremote,{
  __index = origremote,
  __newindex = remotenewindex,
  __debugline = "<LuaRemote Stepping Proxy>",
  __debugchildren = remotedebugchildren,
})


if script.mod_name ~= "debugadapter" then
  remote = newremote
end

return remotestepping