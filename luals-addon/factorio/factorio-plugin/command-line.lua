--##

local util = require("factorio-plugin.util")
local command_line_module_flag = util.module_flags.command_line
local line_start_slashes = util.line_start_slashes

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
  for i = 1, line_start_slashes.count do
    local slash_pos = line_start_slashes[i]
    local command, f_command = text:match("^([a-z-]+%f[%s\0])()", slash_pos + 1)
    if not command then goto continue end
    f_command = text:match("^ __[a-zA-Z0-9_-]+__()", f_command) or f_command
    if commands_lut[command] and not util.is_disabled(slash_pos, command_line_module_flag) then
      util.add_diff(diffs, slash_pos, f_command, "")
    end
    ::continue::
  end
end

return {
  replace = replace,
}
