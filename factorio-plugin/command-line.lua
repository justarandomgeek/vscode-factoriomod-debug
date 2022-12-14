--##

local util = require("factorio-plugin.util")

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
  for s_command, command, f_command in
    util.gmatch_at_start_of_line(text, "()/([a-z-]+%f[%s\0])()")--[[@as fun():integer, string, integer]]
  do
    if commands_lut[command] then
      util.add_diff(diffs, s_command, f_command, "")
    end
  end
end

return {
  replace = replace,
}
