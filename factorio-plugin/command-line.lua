--##

local util = require("factorio-plugin.util")

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  -- Remove the `/sc ` completely and replace with blank space.
  ---@type string|number
  for s_remove, s_id
  in
    text:gmatch("()/silent-command ()")
  do
    util.add_diff(diffs, s_remove, s_id, string.rep(" ", s_id - s_remove))
  end
  
  -- Remove the `/sc ` completely and replace with blank space.
  ---@type string|number
  for s_remove, s_id
  in
    text:gmatch("()/sc ()")
  do
    util.add_diff(diffs, s_remove, s_id, string.rep(" ", s_id - s_remove))
  end
  
  -- Remove the `/command ` completely and replace with blank space.
  ---@type string|number
  for s_remove, s_id
  in
    text:gmatch("()/command ()")
  do
    util.add_diff(diffs, s_remove, s_id, string.rep(" ", s_id - s_remove))
  end
  
  -- Remove the `/c ` completely and replace with blank space.
  ---@type string|number
  for s_remove, s_id
  in
    text:gmatch("()/c ()")
  do
    util.add_diff(diffs, s_remove, s_id, string.rep(" ", s_id - s_remove))
  end
end

return {
  replace = replace,
}
