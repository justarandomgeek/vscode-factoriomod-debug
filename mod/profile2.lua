---@class Profiler2
---@field trackFuncs? boolean
---@field trackLines? boolean
---@field trackTree? boolean
__Profiler2 = __Profiler2 or {}
local __Profiler2 = __Profiler2

local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local print = print
---@type fun(ls:LocalisedString)
local localised_print = localised_print
local debug = debug
local mod_name = script.mod_name
local pairs = pairs

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

---@type LocalisedString[]
local events = {}
local nextevent = 1

local function dump()
  print("***DebugAdapterBlockPrint***\nPROFILE2\x01"..mod_name)
  -- empty the existing table to keep the large allocation it has gained by now...
  for i = 1, nextevent-1, 1 do
    local event = events[i]
    events[i] = nil
    localised_print(event)
  end
  nextevent = 1
  print("***EndDebugAdapterBlockPrint***")
end

local hook
do
  ---@type LuaProfiler
  local hooktimer
  ---@type fun():boolean?
  local hookstop
  ---@type fun()
  local hookreset

  function hookstop()
    local timer = create_profiler(true)
    if not timer then return true end
    hooktimer = timer
    hookstop = timer.stop
    hookreset = timer.reset
  end

  local getinfo = debug.getinfo
  ---@param event string
  ---@param line number
  function hook(event,line)
    if hookstop() then return end

    -- "line" -> currently executing function
    -- "call" "tail call" -> call target
    -- "return" -> returning from
    local info = getinfo(2,"nS") -- currently executing function
    local t = create_profiler(true) --[[@as LuaProfiler]]
    t.add(hooktimer)
    local eventdata
    if event == "line" then
      eventdata = {"","HookEvent\x01line\x01",line,"\x01",t}
    elseif event == "return" then
      eventdata = {"","HookEvent\x01return\x01",t}
    else -- "call" or "tail call"
      --TODO: if call, check for __index/__newindex params?
      eventdata = {"",
        "HookEvent\x01"..event.."\x01"..
        normalizeLuaSource(info.source).."\x01"..info.linedefined
        .."\x01",info.name,"\x01", t}
    end
    do
      local n = nextevent
      events[n] = eventdata
      nextevent=n+1
    end


    if event == "return" then
      -- make sure to stop counting when we exit lua
      local parent = getinfo(3,"f") -- returning to
      if not parent then
        -- top of stack
        if info.what == "main" or info.what == "Lua" then
          dump()
        end
      end
    end

    hookreset()
  end
end

if mod_name ~= "debugadapter" then -- don't hook myself!
  log("profiler2 registered for " .. mod_name)
  debug.sethook(hook, (__Profiler2.trackLines ~= false) and "clr" or "cr")
end