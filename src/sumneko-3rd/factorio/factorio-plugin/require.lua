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

    if name ~= original_name then
      util.add_diff(diffs, start, finish, name)
    end
  end
end

return {
  replace = replace,
}
