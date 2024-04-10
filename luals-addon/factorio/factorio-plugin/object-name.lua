--##

local util = require("factorio-plugin.util")
local object_name_module_flag = util.module_flags.object_name

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  util.reset_is_disabled_to_file_start()
  for f_obj_name in
    string.gmatch(text, "object_name()%f[^a-zA-Z0-9_]")--[[@as fun(): integer]]
  do
    local s_obj_name = f_obj_name - #"object_name"
    if util.is_disabled(s_obj_name, object_name_module_flag) then goto continue end
    local preceding_start = s_obj_name - 128 -- Look behind quite far because variable names can be quite long.
    local preceding_text = text:sub(preceding_start, s_obj_name - 1)
    -- p_front is 1 after the front
    local p_front, p_dot = preceding_text:match("()[a-zA-Z_][a-zA-Z0-9_]*%s*()%.%s*$")
    if not p_front then goto continue end
    preceding_text = preceding_text:sub(1, p_front - 1)
    if preceding_text:find("%.%s*$") or preceding_text:find("function%s*$") then goto continue end
    p_front = preceding_start + p_front - 1
    p_dot = preceding_start + p_dot - 1
    util.add_diff(diffs, p_front, p_front, "__object_name(")
    util.add_diff(diffs, p_dot, p_dot + 1, ")")
    util.add_diff(diffs, p_dot + 1, f_obj_name, "")
    ::continue::
  end
end

return {
  replace = replace,
}
