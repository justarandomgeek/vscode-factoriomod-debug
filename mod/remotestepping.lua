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
local xpcall = xpcall

---@type LuaRemote
local oldremote = remote
local newremote = {
  __raw = oldremote,
}
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

if __DebugAdapter.instrument then
  --- Transfer stepping state and perform the call. Vararg arguments will be forwarded to the
  --- remote function, and any return value from the remote will be returned with the new stepping state in a table.
  ---@param parentstep string "remote"*("next" | "in" | "over" | "out")
  ---@param parentstack StackFrame[]
  ---@param pcallresult boolean
  ---@param interface string
  ---@param func string
  ---@return table
  function remotestepping.callInner(parentstep,parentstack,pcallresult,interface,func,...)
    __DebugAdapter.pushEntryPointName("hookedremote")
    stacks[#stacks+1] = {
      stack = parentstack,
      name = func,
    }
    if parentstep and (parentstep == "over" or parentstep == "out" or parentstep:match("^remote")) then
      parentstep = "remote" .. parentstep
    end
    __DebugAdapter.step(parentstep,true)

    local remotefunc = myRemotes[interface][func]
    local result = {remotefunc(...)}

    parentstep = __DebugAdapter.currentStep()
    __DebugAdapter.step(nil,true)
    stacks[#stacks] = nil
    __DebugAdapter.popEntryPointName()
    parentstep = parentstep and parentstep:match("^remote(.+)$") or parentstep
    if pcallresult then
      table.insert(result,1,true)
    end
    return {step=parentstep,result=result},true
  end

  --- Replacement for LuaRemote::call() which passes stepping state along with the call.
  --- Signature and returns are the same as original LuaRemote::call()
  function newremote.call(interface,func,...)
    do
      local itype = type(interface)
      local ftype = type(func)
      if itype ~= "string" then
        error("Bad argument `interface` expected string got "..itype,2)
      elseif ftype ~= "string" then
        error("Bad argument `func` expected string got "..ftype,2)
      elseif not oldremote.interfaces[interface] then
        error("Unknown interface: "..interface,2)
      elseif not oldremote.interfaces[interface][func] then
        error("No such function: "..interface.."."..func,2)
      end
    end

    local call = oldremote.call
    -- find out who owns it, if they have debug registered...
    local debugname = call("debugadapter","whois",interface)
    if debugname then
      debugname = "__debugadapter_" .. debugname
      local result,multreturn = call(debugname,"remoteCallInner",
        __DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true), false,
        interface, func, ...)

      local childstep = result.step
      result = result.result

      __DebugAdapter.step(childstep,true)
      if multreturn then
        return unpack(result)
      else
        return result[1]
      end

    else
      -- if whois doesn't know who owns it, they must not have debug registered...
      return call(interface,func,...)
    end
  end
else -- not __DebugAdapter.instrument
  --- Transfer stepping state and perform the call. Vararg arguments will be forwarded to the
  --- remote function, and any return value from the remote will be returned with the new stepping state in a table.
  ---@param parentstep string "remote"*("next" | "in" | "over" | "out")
  ---@param parentstack StackFrame[]
  ---@param pcallresult boolean
  ---@param interface string
  ---@param func string
  ---@return table
  function remotestepping.callInner(parentstep,parentstack,pcallresult,interface,func,...)
    __DebugAdapter.pushEntryPointName("hookedremote")
    stacks[#stacks+1] = {
      stack = parentstack,
      name = func,
    }
    if parentstep and (parentstep == "over" or parentstep == "out" or parentstep:match("^remote")) then
      parentstep = "remote" .. parentstep
    end
    __DebugAdapter.step(parentstep,true)

    local remotefunc = myRemotes[interface][func]
    local result = {xpcall(remotefunc,__DebugAdapter.on_exception,...)}

    parentstep = __DebugAdapter.currentStep()
    __DebugAdapter.step(nil,true)
    stacks[#stacks] = nil
    __DebugAdapter.popEntryPointName()
    parentstep = parentstep and parentstep:match("^remote(.+)$") or parentstep
    if not pcallresult then
      table.remove(result,1)
    end
    return {step=parentstep,result=result},true
  end

  --- Replacement for LuaRemote::call() which passes stepping state along with the call.
  --- Signature and returns are the same as original LuaRemote::call()
  function newremote.call(interface,func,...)
    do
      local itype = type(interface)
      local ftype = type(func)
      if itype ~= "string" then
        error("Bad argument `interface` expected string got "..itype,2)
      elseif ftype ~= "string" then
        error("Bad argument `func` expected string got "..ftype,2)
      elseif not oldremote.interfaces[interface] then
        error("Unknown interface: "..interface,2)
      elseif not oldremote.interfaces[interface][func] then
        error("No such function: "..interface.."."..func,2)
      end
    end
    local call = oldremote.call
    -- find out who owns it, if they have debug registered...
    local debugname = call("debugadapter","whois",interface)
    if debugname then
      debugname = "__debugadapter_" .. debugname
      local result,multreturn = call(debugname,"remoteCallInner",
        __DebugAdapter.currentStep(), __DebugAdapter.stackTrace(-2, nil, true), true,
        interface, func, ...)

      local childstep = result.step
      result = result.result

      if not result[1] then
        local err = result[2]
        error({"REMSTEP","Error when running interface function ", interface, ".", func, ":\n", err},-1)
      end

      __DebugAdapter.step(childstep,true)
      if multreturn then
        return unpack(result,2)
      else
        return result[2]
      end

    else
      -- if whois doesn't know who owns it, they must not have debug registered...
      return call(interface,func,...)
    end
  end
end

function remotestepping.hasInterface(name)
  return myRemotes[name] ~= nil
end

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

function newremote.add_interface(remotename,funcs,...)
  myRemotes[remotename] = funcs
  return oldremote.add_interface(remotename,funcs,...)
end

function newremote.remove_interface(remotename,...)
  myRemotes[remotename] = nil
  return oldremote.remove_interface(remotename,...)
end

local remotemeta = {
  __index = oldremote,
  __newindex = function(t,k,v) oldremote[k] = v end,
  __debugline = "<LuaRemote Debug Proxy>",
  __debugchildren = function(t)
    return {
      variables.create([["interfaces"]],oldremote.interfaces),
      variables.create("<raw>",oldremote),
      {
        name = "<stacks>",
        value = "<stacks>",
        type = "StackFrame[]",
        variablesReference = variables.tableRef(stacks),
      },
      {
        name = "<myRemotes>",
        value = "<myRemotes>",
        type = "table",
        variablesReference = variables.tableRef(myRemotes),
      },
    }
  end,
}
__DebugAdapter.stepIgnoreAll(newremote)
__DebugAdapter.stepIgnoreAll(remotemeta)
setmetatable(newremote,remotemeta)
remote = newremote

__DebugAdapter.stepIgnoreAll(remotestepping)
return remotestepping