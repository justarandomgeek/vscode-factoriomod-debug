--##

local util = require("factorio-plugin.util")

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  for start, name, finish in
    text:gmatch("require%s*%(?%s*['\"]()(.-)()['\"]%s*%)?")--[[@as fun(): integer, string, integer]]
  do

    local original_name = name

    ---Convert the mod name prefix if there is one
    name = name:gsub("^__(.-)__", "%1")

    ---If the path has slashes in it, it may also have an extension
    ---the LS is not expecting. Factorio would also clobber any extension
    ---to .lua anyway. This just strips it to go with the default `?.lua`
    ---search pattern in "Lua.runtime.path"
    if name:match("[\\/]") then
      name = name:gsub("%.%a+$", "")
    end

    if name ~= original_name then
      util.add_diff(diffs, start, finish, name)
    end
  end
end

return {
  replace = replace,
}
