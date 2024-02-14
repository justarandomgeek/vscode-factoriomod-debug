-- non-instrument mode still needs a modules dump
-- this may not be early enough for a require in settings stage,
-- but covers anything later (data/control)
-- if using manual require in settings stage, include an optional dep on debugadapter to force ordering
if not debug.getregistry().__DASentModules then
  local json = require('__debugadapter__/json.lua')
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
  json.event{event="modules", modules=modules}
  debug.getregistry().__DASentModules = true
end