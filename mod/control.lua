if __Profiler then
  require("__debugadapter__/profile-control.lua")
  return
end
--[[
  debugger requires primary handler for some events, use these instead to be
  called when internal events finish:

  sharedevents = {
    on_init = function?,
    on_load = function?,
    on_tick = function?,
  }
]]
local sharedevents = require("__debugadapter__/debug-control.lua")
