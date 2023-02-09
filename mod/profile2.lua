---@class Profiler2
---@field trackFuncs? boolean
---@field trackLines? boolean
---@field trackTree? boolean
__Profiler2 = __Profiler2 or {}
local __Profiler2 = __Profiler2

local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
---@type fun(ls:LocalisedString)
local localised_print = localised_print
local debug = debug
local mod_name = script.mod_name
local pairs = pairs
local setmetatable = setmetatable

local create_profiler
do
  local validLuaObjectTypes = {table=true,userdata=true}
  local reg = debug.getregistry()
  local dgetmetatable = debug.getmetatable
  local type = type
  ---@param stopped? boolean
  ---@return LuaProfiler?
  function create_profiler(stopped)
    do
      local game = game
      if game then -- everywhere but main chunk or on_load
        create_profiler = game.create_profiler
        return create_profiler(stopped)
      end
    end

    -- it's in the registery for on_load, but with whatever ref id was free
    -- find it by its metatable, since that has a name on it at least...
    -- DON'T DO THIS! THIS IS A HORRIBLE HACK!
    local gmt = reg["LuaGameScript"] --[[@as table?]]
    if gmt then -- but it's not there when instruments first run
      for _,t in pairs(reg) do
        if validLuaObjectTypes[type(t)] and dgetmetatable(t)==gmt then
          create_profiler = (t--[[@as LuaGameScript]]).create_profiler
          return create_profiler(stopped)
        end
      end
    end
  end
end

local hook
do
  ---@type LuaProfiler
  local hooktimer
  ---@type fun()
  local hookreset
  local function hookstop()
    local timer = create_profiler(true)
    if not timer then return true end
    hooktimer = timer
    hookstop = timer.stop
    hookreset = timer.reset
  end

  local callprefix = {
    ["call"] = "\x01P\x02c\x01"..mod_name.."\x01",
    ["tail call"] = "\x01P\x02t\x01"..mod_name.."\x01",
  }

  local linemesg = {"","\x01P\x02l\x01",0,"\x01",hooktimer}
  local returnmesg = {"","\x01P\x02r\x01",hooktimer}
  local callmesg = {"", "", "", "\x01", hooktimer}

  local funcid = setmetatable({}, {__mode="k"})

  local getinfo = debug.getinfo
  ---@param event string
  ---@param line number
  function hook(event,line)
    if hookstop() then return end
    if event == "line" then
      linemesg[3] = line
      localised_print(linemesg)
    elseif event == "return" then
      localised_print(returnmesg)
    else -- "call" or "tail call"
      local info = getinfo(2,"fnS")
      do
        local f = funcid[info.func]
        if not f then
          f = callprefix[event]..normalizeLuaSource(info.source).."\x01"..info.linedefined.."\x01"
          funcid[info.func] = f
        end
        callmesg[2] = f
      end
      callmesg[3] = info.name
      localised_print(callmesg)
    end
    hookreset()
  end
end

if mod_name ~= "debugadapter" then -- don't hook myself!
  if script.level.is_simulation then
    log("profiler2 skipped for simulation")
  else
    log("profiler2 registered for " .. mod_name)
    debug.sethook(hook, (__Profiler2.trackLines ~= false) and "clr" or "cr")
  end
end