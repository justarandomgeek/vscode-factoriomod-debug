-- config.lua

-- The name to use when suggesting this emulation. If omitted,
-- the name of the folder will be used
name = "Factorio"

-- A list of filenames to look for in the workspace. If a
-- match is found, this environment will be recommended
files = {
  "control%.lua", -- exact match
  "data%.lua", -- exact match
  "data%-updates%.lua", -- exact match
  "data%-final%-fixes%.lua", -- exact match
  "settings%.lua", -- exact match
  "settings%-updates%.lua", -- exact match
  "settings%-final%-fixes%.lua", -- exact match
}

-- configuration values to set/override in the user's local
-- config file when this emulation is applied
configs = {
  {
    key    = "Lua.runtime.version",
    action = "set",
    value  = "Lua 5.2"
  },
  {
    key    = 'Lua.runtime.special',
    action = 'prop',
    prop   = 'require',
    value  = 'require',
},
}

for _, name in ipairs({
  "io", "os", "coroutine",
  "package",
}) do
  configs[#configs+1] = {
    key    = 'Lua.runtime.builtin',
    action = 'prop',
    prop   = name,
    value  = 'disable',
  }
end

for _, name in ipairs({
  "mods", "serpent",
  "global",
  "__DebugAdapter", "__Profiler",
}) do
  configs[#configs+1] = {
    key    = "Lua.diagnostics.globals",
    action = "add",
    value  = name
  }
end
