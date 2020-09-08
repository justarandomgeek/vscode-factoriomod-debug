local function disable_autosave()
  -- disable autosave so it won't try to save timers, this is a desync but i don't care.
  script.on_nth_tick(2,function(e)
    script.on_nth_tick(2,nil)
    game.autosave_enabled = false
  end)
end

script.on_init(disable_autosave)
script.on_load(disable_autosave)

local function callAll(funcname,...)
  local results = {}
  local call = remote.call
  for remotename,_ in pairs(remote.interfaces) do
    local modname = remotename:match("^__profiler_(.+)$")
    if modname then
      results[modname] = call(remotename,funcname,...)
    end
  end
  return results
end

remote.add_interface("profiler",{
  dump = function() return callAll("dump") end,
  slow = function() return callAll("slow") end,
  save = function(name)
    callAll("slow")
    game.autosave_enabled = true
    game.auto_save(name or "profiler")
    disable_autosave()
  end,
})