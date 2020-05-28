local function begin()
  -- start profiling early...
  script.on_nth_tick(2,function(e)
    script.on_nth_tick(2,nil)
    game.autosave_enabled = false
  end)
end

script.on_init(begin)
script.on_load(begin)