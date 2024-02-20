print("\xEF\xB7\x90\xEE\x80\x81")
debug.debug()
if __DebugAdapter then
  __DebugAdapter.__config = __DebugAdapter.__config or {}
  __DebugAdapter.__config.instrument = true
  require("__debugadapter__/debugadapter.lua")
end