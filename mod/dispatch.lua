
local threads = require("__debugadapter__/threads.lua")

local string = string
local smatch = string.match

---@type LuaRemote
local remote = (type(remote)=="table" and rawget(remote,"__raw")) or remote
local rcall = remote and remote.call

---@class DebugAdapter.Dispatch
local dispatch = {}

local __daremote = {}
local __remote = {}
dispatch.__remote = __remote
dispatch.__daremote = __daremote
if remote then
  if script.mod_name ~= "debugadapter" then
    remote.add_interface("__debugadapter_" .. script.mod_name, __remote)
  else
    remote.add_interface("debugadapter", __daremote)
  end
end

local function isMainChunk()
  local i = 2 -- no need to check getinfo or isMainChunk
  ---@type string
  local what
  local getinfo = debug.getinfo
  while true do
    local info = getinfo(i,"S")
    if info then
      what = info.what
      i = i + 1
    else
      break
    end
  end
  return what == "main"
end

local function canRemoteCall()
  -- remote.call is only legal from within events, game catches all but on_load
  -- during on_load, script exists and the root of the stack is no longer the main chunk
  return not not (game or script and not isMainChunk())
end
dispatch.canRemoteCall = canRemoteCall

--- call a remote function in all registered mods
---@param funcname string Name of remote function to call
function dispatch.callAll(funcname,...)
  if canRemoteCall() then
    for remotename,interface in pairs(remote.interfaces) do
      local modname = smatch(remotename,"^__debugadapter_(.+)$")
      if modname and interface[funcname] then
        rcall(remotename,funcname,...)
      end
    end
  else
    __remote[funcname](...)
  end
end

--- call a remote function in all registered mods until one returns true
---@param funcname string Name of remote function to call
---@return boolean
function dispatch.find(funcname,...)
  -- try local first...
  if __remote[funcname](...) then
    return true
  end

  -- then call around if possible...
  if canRemoteCall() then
    for remotename,interface in pairs(remote.interfaces) do
      local modname = smatch(remotename,"^__debugadapter_(.+)$")
      if modname and interface[funcname] then
        if rcall(remotename,funcname,...) then
          return true
        end
      end
    end
  end
  return false
end


function dispatch.callMod(modname, funcname, ...)
  if modname == script.mod_name then
    return true, __remote[funcname](...)
  end

  if canRemoteCall() then
    local remotename = "__debugadapter_"..modname
    local interface = remote.interfaces[remotename]
    if interface[funcname] then
      return true, remote.call(remotename, funcname, ...)
    end
  end

  return false
end

function dispatch.callThread(threadid, funcname, ...)
  if threadid == threads.this_thread then
    return true, __remote[funcname](...)
  end

  local thread = threads.active_threads[threadid]
  if canRemoteCall() then
    local remotename = "__debugadapter_"..thread.name
    local interface = remote.interfaces[remotename]
    if interface[funcname] then
      return true, remote.call(remotename, funcname, ...)
    end
  end

  return false
end

function dispatch.callFrame(frameId, funcname, ...)
  local thread,i,tag = threads.splitFrameId(frameId)
  if thread.id == threads.this_thread then
    return true, __remote[funcname](i, tag, ...)
  end

  if canRemoteCall() then
    local remotename = "__debugadapter_"..thread.name
    local interface = remote.interfaces[remotename]
    if interface[funcname] then
      return true, remote.call(remotename, funcname, i, tag, ...)
    end
  end

  return false
end


do
  -- functions for passing stepping state across context-switches by handing it to main DA vm

  ---@type number?
  local cross_stepping
  ---@type boolean?
  local cross_step_instr

  ---@param clear? boolean default true
  ---@return number? stepping
  ---@return boolean? step_instr
  function dispatch.getStepping(clear)
    if script and script.mod_name ~= "debugadapter" and canRemoteCall() and remote.interfaces["debugadapter"] then
      return remote.call--[[@as fun(string,string,boolean?):number?,boolean?]]("debugadapter", "getStepping", clear)
    else
      local stepping,step_instr = cross_stepping, cross_step_instr
      if clear ~= false then
        cross_stepping,cross_step_instr = nil,nil
      end

      return stepping,step_instr
    end
  end
  __daremote.getStepping = dispatch.getStepping

  ---@param stepping? number
  ---@param step_instr? boolean
  function dispatch.setStepping(stepping, step_instr)
    if script and script.mod_name ~= "debugadapter" and canRemoteCall() and remote.interfaces["debugadapter"] then
      return remote.call("debugadapter", "setStepping", stepping, step_instr)
    else
      cross_stepping = stepping
      cross_step_instr = step_instr
    end
  end
  __daremote.setStepping = dispatch.setStepping
end


return dispatch