--##

local util = require("factorio-plugin.util")

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  ---@type string|number
  for s_narrow, s_id, f_id
  in
    text:gmatch("()%-%-%-[^%S\n]*@narrow +()[a-zA-Z_][a-zA-Z0-9_]*()")
  do
    -- the ---@narrow gets completely replaced with blank space
    -- which effectively removes the highlight of it being replaced with
    -- a variable (like when you position your cursor on the identifier)
    util.add_diff(diffs, s_narrow, s_id, string.rep(" ", s_id - s_narrow))
    util.add_diff(diffs, f_id, f_id, "=nil---@type")
  end
end

return {
  replace = replace,
}
