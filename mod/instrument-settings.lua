print("DBG: on_instrument_settings")
debug.debug()
if __DebugAdapter then
  -- on_error is a global available in "Instrument Mode"
  -- This controls the insertion of debug hooks (don't need xpcall for break-on-exception) and
  -- stack frame hiding (don't need to hide xpcall)
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
end