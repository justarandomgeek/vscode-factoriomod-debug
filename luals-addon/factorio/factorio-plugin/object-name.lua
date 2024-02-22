--##

local util = require("factorio-plugin.util")
local object_name_module_flag = util.module_flags.object_name

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  util.reset_is_disabled_to_file_start()
  ---@type integer, string, integer
  for line_start, preceding_text, f_obj_name in
    util.gmatch_at_start_of_line(text, "()([^\n]-)object_name()%f[^a-zA-Z0-9_]")
  do
    -- p_front is 1 after the front
    local p_front, p_dot = string.match(preceding_text, "()[a-zA-Z_][a-zA-Z0-9_]*%s*()%.%s*$")
    if not p_front then goto continue end
    p_front = line_start + p_front - 1
    p_dot = line_start + p_dot - 1
    preceding_text = string.sub(text, line_start--[[@as integer]], p_front - 1)
    if preceding_text:find("%.%s*$")
      or preceding_text:find("function%s*$")
      or util.is_disabled(p_front, object_name_module_flag)
    then
      goto continue
    end
    util.add_diff(diffs, p_front, p_front, "__object_name(")
    util.add_diff(diffs, p_dot, p_dot + 1, ")")
    util.add_diff(diffs, p_dot + 1, f_obj_name, "")
    ::continue::
  end
end

return {
  replace = replace,
}
