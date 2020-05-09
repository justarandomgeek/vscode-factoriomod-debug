local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")

__Profiler = __Profiler or {}
local __Profiler = __Profiler
__Profiler.linetimers = {}
__Profiler.linecounts = {}

function __Profiler.getlinetimer(file,line)
  local f = __Profiler.linetimers[file]
  if not f then
    f = {}
    __Profiler.linetimers[file] = f
  end
  local fc = __Profiler.linecounts[file]
  if not fc then
    fc = {}
    __Profiler.linecounts[file] = fc
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
function __Profiler.attach()
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
        activeline = __Profiler.getlinetimer(s,line)
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
function __Profiler.clear()
  pause_profile = true
  if activeline then activeline.stop() end
  __Profiler.linetimers = {}
  __Profiler.linecounts = {}
  pause_profile = nil
end

function __Profiler.dump()
  pause_profile = true
  if activeline then activeline.stop() end
  print("PMN:"..script.mod_name)
  for file,f in pairs(__Profiler.linetimers) do
    print("PFN:"..file)
    for line,timer in pairs(f) do
      local count = __Profiler.linecounts[file][line]
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
    dump = __Profiler.dump,
  })

  __Profiler.attach()
end