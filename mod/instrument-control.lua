print("\xEF\xB7\x90\xEE\x80\x82"..script.mod_name)
debug.debug()
if __DebugAdapter then
  __DebugAdapter.__config = __DebugAdapter.__config or {}
  __DebugAdapter.__config.instrument = true
  require("__debugadapter__/debugadapter.lua")
elseif __Profiler then
  require("__debugadapter__/profile.lua")
elseif __Profiler2 then
  require("__debugadapter__/profile2.lua")
end