local function dumpAll()
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

--TODO: correctly handle dumping everything just before migrations and hooking just after them
script.on_nth_tick(2,function(e)
  script.on_nth_tick(2,nil)
  game.autosave_enabled = false
  dumpAll()
end)

--TODO: adjustable auto-dump schedule?
script.on_nth_tick(600,function(e)
  dumpAll()
end)

remote.add_interface("profiler",{
  dump = dumpAll,
})