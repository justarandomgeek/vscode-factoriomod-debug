local json = require('__debugadapter__/json.lua')
local modules = {}
for name,version in pairs(mods) do
  modules[#modules+1] = {
    id = name, name = name,
    version = version,
  }
end
modules[#modules+1] = { id = "level", name = "level", }
print("EVTmodules: " .. json.encode(modules))
debug.getregistry().__DASentModules = true

print("DBG: on_instrument_settings")
debug.debug()
if __DebugAdapter then
  -- on_error is a global available in "Instrument Mode"
  -- This controls the insertion of debug hooks (don't need xpcall for break-on-exception) and
  -- stack frame hiding (don't need to hide xpcall)
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
end