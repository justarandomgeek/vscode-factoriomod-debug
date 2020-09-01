local function begin()
  -- disable autosave so it won't try to save timers, this is a desync but i don't care.
  script.on_nth_tick(2,function(e)
    script.on_nth_tick(2,nil)
    game.autosave_enabled = false
  end)
end

script.on_init(begin)
script.on_load(begin)