print("DBG: on_instrument_control "..script.mod_name)
debug.debug()
if __DebugAdapter then
  -- on_error is a global available in "Instrument Mode"
  -- This controls the insertion of debug hooks (don't need xpcall for break-on-exception) and
  -- stack frame hiding (don't need to hide xpcall)
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
elseif __Profiler then
  if not localised_print then
    error("Profiling requires Factorio >= 0.18.24")
  end
  require("__debugadapter__/profile.lua")
end