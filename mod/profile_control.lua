local function dump_all()
  if game then
    local t = game.create_profiler()
    print("***DebugAdapterBlockPrint***\nPROFILE:")
    local call = remote.call
    local match = string.match
    for remotename,_ in pairs(remote.interfaces) do
      local modname = match(remotename,"^__profiler_(.+)$")
      if modname then
        call(remotename,"dump")
      end
    end
    t.stop()
    localised_print{"","POV:",t}
    print("***EndDebugAdapterBlockPrint***")
  end
end

local function clear_all()
  if game then
    local call = remote.call
    local match = string.match
    for remotename,_ in pairs(remote.interfaces) do
      local modname = match(remotename,"^__profiler_(.+)$")
      if modname then
        call(remotename,"clear")
      end
    end
  end
end

local function begin()
  -- start profiling early...
  script.on_nth_tick(2,function(e)
    script.on_nth_tick(2,nil)
    game.autosave_enabled = false
    dump_all()
  end)
end

script.on_init(begin)
script.on_load(begin)

local function set_refresh_rate(ticks)
  script.on_nth_tick(nil)
  script.on_nth_tick(ticks,function(e)
    dump_all()
  end)
end

set_refresh_rate(100)

remote.add_interface("profiler",{
  dump = dump_all,
  clear = clear_all,
  set_refresh_rate = set_refresh_rate,
})