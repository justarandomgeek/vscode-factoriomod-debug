--##

local util = require("factorio-plugin.util")

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  -- p_front is 1 after the front
  ---@type string, integer, integer, integer
  for preceding_text, p_front, p_dot, f_obj_name in
    util.gmatch_at_start_of_line(text, "([^\n]-)()[a-zA-Z_][a-zA-Z0-9_]*%s*()%.%s*object_name()%f[^a-zA-Z0-9_]")
  do
    if preceding_text:find("--", 1, true)
      or preceding_text:find("%.%s*$")
      or preceding_text:find("function%s*$")
    then
      goto continue
    end
    util.add_diff(diffs, p_front, p_front, "--\n__object_name(---@diagnostic disable-line: undefined-global\n")
    util.add_diff(diffs, p_dot, p_dot + 1, ")")
    util.add_diff(diffs, p_dot + 1, f_obj_name, "")
    ::continue::
  end
end

return {
  replace = replace,
}
