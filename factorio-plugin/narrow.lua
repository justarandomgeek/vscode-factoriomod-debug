--##

local util = require("factorio-plugin.util")

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  ---@type string|number
  for s, s_id, id, f
  in
    text:gmatch("()%-%-%-@narrow +()([a-zA-Z_][a-zA-Z0-9_]*)()")
  do
    -- the ---@narrow gets completely replaced with blank space
    -- which effectively removes the highligt of it being replaced with
    -- a variable (like when you position your curosr on the identifier)
    util.add_diff(diffs, s, s_id, string.rep(" ", 11)..id.."=")
    util.add_diff(diffs, f, f, "---@type")
  end
end

return {
  replace = replace,
}
