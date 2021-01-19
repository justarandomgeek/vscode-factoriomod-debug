print("DBG: on_instrument_control "..script.mod_name)
debug.debug()
if __DebugAdapter then
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
elseif __Profiler then
  require("__debugadapter__/profile.lua")
end