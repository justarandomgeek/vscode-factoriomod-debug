--##

local util = require("factorio-plugin.util")
local command_line_module_flag = util.module_flags.command_line

local commands_lut = {
  ["command"] = true,
  ["c"] = true,
  ["silent-command"] = true,
  ["sc"] = true,
  ["measured-command"] = true,
}

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  util.reset_is_disabled_to_file_start()
  for s_command, command, f_command in
    util.gmatch_at_start_of_line(text, "()/([a-z-]+%f[%s\0])()")--[[@as fun():integer, string, integer]]
  do
    f_command = text:match("^ __[a-zA-Z0-9_-]+__()", f_command) or f_command
    if commands_lut[command] and not util.is_disabled(s_command, command_line_module_flag) then
      util.add_diff(diffs, s_command, f_command, "")
    end
  end
end

return {
  replace = replace,
}
