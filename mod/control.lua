if not (__DebugAdapter or __Profiler) then
  print("\xEF\xB7\x90\xEE\x80\x83")
  debug.debug()
end

if __Profiler then
  require("__debugadapter__/profile-control.lua")
  return
end
if __Profiler2 then
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
