__Profiler = __Profiler or {
  dump = function ()
    remote.call("profiler","dump")
  end,
  clear = function()
    remote.call("profiler","clear")
  end,
  set_refresh_rate = function()
    remote.call("profiler","set_refresh_rate")
  end,
}

local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")

local linetimers = {}
local linecounts = {}

local function getlinetimer(file,line)
  local f = linetimers[file]
  if not f then
    f = {}
    linetimers[file] = f
  end
  local fc = linecounts[file]
  if not fc then
    fc = {}
    linecounts[file] = fc
  end

  local t = f[line]
  if not t then
    -- try to start stopped, create_profiler did not
    -- check arg count before it got `stopped:boolean`
    -- so it's safe to set regardless
    t = game.create_profiler(true)
    -- but stop anyway, just in case it doesn't have it yet
    t.stop()
    --localised_print{"","created "..file..":"..line.." ",t}
    f[line] = t
  end
  fc[line] = (fc[line] or 0) + 1
  return t
end

local pause_profile = true
local activeline
local function attach()
  local getinfo = debug.getinfo
  local sub = string.sub
  debug.sethook(function(event,line)
    if pause_profile then return end
    if activeline then activeline.stop() end
    if event == "line" then
      local info = getinfo(2,"Slf")
      local s = info.source
      -- startup logging gets all the serpent loads of `global`
      -- serpent itself will also always show up as one of these
      if game and sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        -- switch/start line timer
        activeline = getlinetimer(s,line)
      else
        -- stop line timer
        activeline = nil
      end
    else
      if event == "return" or event == "tail call" then
        local info = getinfo(2,"Slf")
        --local s = info.source
        --if sub(s,1,1) == "@" then
        --  -- stop function timer
        --else
        --  -- ??
        --end
        local parent = getinfo(3,"f")
        if not parent then
          -- top of stack
          if info.what == "main" or info.what == "Lua" then
            activeline = nil
          end
        end
      end
      --if event == "call" or event == "tail call" then
      --  local info = getinfo(2,"Slf")
      --  local s = info.source
      --  if sub(s,1,1) == "@" then
      --    -- switch/start function timer
      --  else
      --    -- ??
      --  end
      --end
    end
    if activeline then activeline.restart() end
  end,"lr")

  on_error(function(mesg)
    -- dump all profiles
    __Profiler.dump()
  end)
end

-- clear a timer
local function clear()
  pause_profile = true
  if activeline then activeline.stop() end
  linetimers = {}
  linecounts = {}
  pause_profile = nil
end

local function dump()
  pause_profile = true
  if activeline then activeline.stop() end
  print("PMN:"..script.mod_name)
  for file,f in pairs(linetimers) do
    print("PFN:"..file)
    for line,timer in pairs(f) do
      local count = linecounts[file][line]
      localised_print{"","PLN:",line,":",timer,":",count}
    end
  end
  pause_profile = nil
end

if script.mod_name ~= "debugadapter" then -- don't hook myself!
  -- in addition to the global, set up a remote so we can configure from DA's on_tick
  -- and pass stepping state around remote calls
  log("profiler registered for " .. script.mod_name)
  remote.add_interface("__profiler_" .. script.mod_name ,{
    dump = dump,
    clear = clear,
  })

  attach()
end