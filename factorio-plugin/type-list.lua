
local util = require("factorio-plugin.util")

---count how often the pattern matches in the given string
---@param s string
---@param pattern string
---@return integer
local function match_count(s, pattern)
  local c = 0
  for _ in s:gmatch(pattern) do
    c = c + 1
  end
  return c
end

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  ---@type string|number
  for s_typelist_str, typelist_str, s_next_line, next_line
  in
    text:gmatch("()%-%-%-@typelist([^\n]*)\n()([^\n]*)")
  do

    if next_line:match("^%s*%-%-") then
      goto continue
    end

    ---@type string[]
    local types = {}
    do
      local open_count = 0
      ---@type string
      local current_type = nil
      for part in typelist_str:gmatch("[^,]*") do
        if current_type then
          current_type = current_type .. "," .. part
        else
          current_type = part
        end
        open_count = open_count + match_count(part, "[%(<]")
        open_count = open_count - match_count(part, "[%)>]")
        if open_count == 0 then
          ---@type string
          types[#types+1] = current_type
          current_type = nil
        elseif open_count < 0 then
          goto continue
        end
      end
      if current_type then
        types[#types+1] = current_type
      end
    end

    util.add_diff(diffs, s_typelist_str, s_next_line, "--") -- to prevent the wanring of a line with only spaces

    local i = 0
    ---@type number
    for s_list_item in next_line:gmatch("()[^,]*") do
      i = i + 1
      local current_type = types[i]
      if not current_type then break end
      local insert_position = s_next_line + s_list_item - 1
      util.add_diff(diffs, insert_position, insert_position, "\n---@type " .. current_type .. "\n")
    end

    ::continue::
  end
end

return {
  replace = replace,
}
