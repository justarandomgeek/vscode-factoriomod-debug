local json = require('__debugadapter__/json.lua')
---@type DebugProtocol.Module[]
local modules = {
  { id = "core", name = "core", },
  { id = "level", name = "level", },
  { id = "#user", name = "#user", },
}
for name,version in pairs(mods) do
  modules[#modules+1] = {
    id = name, name = name,
    version = version,
  }
end
print("EVTmodules: " .. json.encode(modules))
debug.getregistry().__DASentModules = true

print("DBG: on_instrument_settings")
debug.debug()
if __DebugAdapter then
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
end