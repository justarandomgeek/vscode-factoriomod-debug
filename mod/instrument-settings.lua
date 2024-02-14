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
json.event{event="modules", body=modules}
debug.getregistry().__DASentModules = true

print("\xEF\xB7\x90\xEE\x80\x80")
debug.debug()
if __DebugAdapter then
  __DebugAdapter.instrument = true
  require("__debugadapter__/debugadapter.lua")
end