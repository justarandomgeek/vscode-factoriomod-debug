print("DBG: on_instrument_control "..script.mod_name)
debug.debug()
if __DebugAdapter then
  -- on_error is a global available in "Instrument Mode"
  -- This controls the insertion of debug hooks (don't need xpcall for break-on-exception) and
  -- stack frame hiding (don't need to hide xpcall)
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
elseif __Profiler then
  local a,b,c = script.active_mods.base:match("(%d+).(%d+).(%d+)")
  if not (a=="1" or (a=="0" and b=="18" and (tonumber(c) or 0)>=27)) then
    -- most recent feature required: LuaProfiler::add()
    error("Profiling requires Factorio >= 0.18.27")
  end
  require("__debugadapter__/profile.lua")
end