local variables = require("__debugadapter__/variables.lua")

-- Set up a hook on remote.call to pass stepping state ahead of and back from
-- a remote.call into another mod. This also sets up a (nearly) transparent
-- proxy for the whole `remote` object, and demonstrates custom debug views
-- using the `__debugline` and `__debugchildren` metamethods.
-- The original `remote` LuaRemote object is available at `remote.__raw`.

local remotestepping = {}

local __DebugAdapter = __DebugAdapter
local setmetatable = setmetatable

---@type LuaRemote
local oldremote = remote
local newremote = {
  __raw = oldremote,
}
local myRemotes = {}

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
  __debugtype = "DebugAdapter.LuaRemote",
  __debugchildren = function(t)
    return {
      variables.create([["interfaces"]],oldremote.interfaces),
      variables.create("<raw>",oldremote),
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