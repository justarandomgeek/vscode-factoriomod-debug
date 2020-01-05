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

--- Transfer stepping state and perform the call. Vararg arguments will be forwarded to the
--- remote function, and any return value from the remote will be returned with the new stepping state in a table.
---@param parentstep string "remote"*("next" | "in" | "over" | "out")
---@param parentstack StackFrame[]
---@param remotename string
---@param fname string
---@return table
function remotestepping.callInner(parentstep,parentstack,remotename,fname,...)
  stacks[#stacks+1] = {
    stack = parentstack,
    name = fname,
  }
  if parentstep and (parentstep == "over" or parentstep == "out" or parentstep:match("^remote")) then
    parentstep = "remote" .. parentstep
  end
  __DebugAdapter.step(parentstep,true)

  local func = myRemotes[remotename][fname]
  assert(type(func) == "function","attempted to step into invalid remote function " .. remotename .. "." .. fname)
  local result = {func(...)}

  parentstep = __DebugAdapter.currentStep()
  __DebugAdapter.step(nil,true)
  stacks[#stacks] = nil
  parentstep = parentstep and parentstep:match("^remote(.+)$") or parentstep
  --TODO: if multiple returns are actually supported in the future, change to `parentstep,unpack(result)`
  return {step=parentstep,result=result},true
end
__DebugAdapter.stepIgnore(remotestepping.callInner)


--- Replacement for LuaRemote::call() which passes stepping state along with the call.
--- Signature and returns are the same as original LuaRemote::call()
local function remotestepcall(remotename,method,...)
  local call = origremote.call
  if not game then -- remove this in 0.18 with script.active_mods
    -- if game isn't ready we can't prepare stack traces yet, so just call directly...
    return call(remotename,method,...)
  end
  -- find out who owns it, if they have debug registered...
  local debugname = call("debugadapter","whois",remotename)
  if debugname then
    debugname = "__debugadapter_" .. debugname
    --TODO: if multiple returns are added, capture them all and change the unpack for return
    local result,multreturn = call(debugname,"remoteCallInner",
      __DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true),
      remotename, method, ...)

    local childstep = result.step
    __DebugAdapter.step(childstep,true)
    if multreturn then
      return unpack(result.result)
    else
      return result.result[1]
    end

  else
    -- if whois doesn't know who owns it, they must not have debug registered...
    return call(remotename,method,...)
  end
end
__DebugAdapter.stepIgnore(remotestepcall)


function remotestepping.hasInterface(name)
  return myRemotes[name] ~= nil
end
__DebugAdapter.stepIgnore(remotestepping.hasInterface)

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