--##

local util = require("factorio-plugin.util")
local require_module_flag = util.module_flags.require

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  util.reset_is_disabled_to_file_start()
  for f_require, start, name, finish in
    text:gmatch("require()%s*%(?%s*['\"]()(.-)()['\"]%s*%)?")--[=[@as fun(): integer, integer, string, integer]=]
  do
    local original_name = name

    ---Convert the mod name prefix if there is one
    name = name:gsub("^__(.-)__", "%1")

    ---If the path has slashes in it, it may also have an extension
    ---the LS is not expecting. Factorio would also clobber any extension
    ---to .lua anyway. This just strips it to go with the default `?.lua`
    ---search pattern in "Lua.runtime.path"
    ---The test pattern checks for a dotted name after the final slash
    ---The replacement pattern then strips the last dotted segment
    if name:match("[\\/][^\\/]-%.[^.\\/]+$") then
      name = name:gsub("%.[^.\\/]+$", "")
    end

    if name ~= original_name and not util.is_disabled(f_require - 1, require_module_flag) then
      util.add_diff(diffs, start, finish, name)
    end
  end
end

return {
  replace = replace,
}
