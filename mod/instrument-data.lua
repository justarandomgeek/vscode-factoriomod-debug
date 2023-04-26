print("\xEF\xB7\x90\xEE\x80\x81")
debug.debug()
if __DebugAdapter then
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
end