--##

local floor_div = __plugin_dev
  and function(left, right) return math.floor(left / right) end
  or load("return function(left, right) return left // right end")()
local band = __plugin_dev and bit32.band or load("return function(left, right) return left & right end")()
local bor = __plugin_dev and bit32.bor or load("return function(left, right) return left | right end")()
local bnot = __plugin_dev and bit32.bnot or load("return function(value) return ~value end")()

---@enum PluginDisableFlags
local module_flags = {
  none = 0,
  command_line = 1,
  global = 2,
  object_name = 4,
  on_event = 8,
  remote_add = 16,
  remote_call = 32,
  require = 64,
  all = 127,
}

---@type integer[]
local disabled_positions = {1} -- Always contains 1 element.
---@type PluginDisableFlags[]
local disabled_flags = {module_flags.none} -- Indexes match up with `disabled_positions`.
local disabled_positions_count = 1
local current_disabled_positions_lower_bound = 0 -- Zero based.

---@param position integer
---@param flag PluginDisableFlags
---@return boolean
local function is_disabled(position, flag)
  local lower_bound = current_disabled_positions_lower_bound -- Zero based, inclusive.
  local upper_bound = disabled_positions_count -- Zero based, exclusive.
  local i = floor_div(lower_bound + upper_bound, 2)
  -- Try close to the lower bound first, since text is processed front to back.
  i = math.min(i, lower_bound + 8)
  while true do
    local pos = disabled_positions[i + 1]
    if position >= pos then
      lower_bound = i + 1
    else
      upper_bound = i
    end
    if lower_bound == upper_bound then break end
    i = floor_div(lower_bound + upper_bound, 2)
  end
  lower_bound = lower_bound - 1
  current_disabled_positions_lower_bound = lower_bound
  local flags = disabled_flags[lower_bound + 1] -- + 1 to go from zero to one based.
  return band(flags, flag) ~= 0
end

local function reset_is_disabled_to_file_start()
  current_disabled_positions_lower_bound = 0
end

local function clean_up_disabled_data()
  for i = 2, disabled_positions_count do
    disabled_positions[i] = nil
    disabled_flags[i] = nil
  end
  disabled_positions_count = 1
  current_disabled_positions_lower_bound = 0
end

local function add_disabled_flags(position, flags)
  local count = disabled_positions_count + 1
  disabled_positions_count = count
  disabled_positions[count] = position
  disabled_flags[count] = flags
end

local gmatch_at_start_of_line

---@param text string
local function find_plugin_disable_annotations(text)
  local current_flags = disabled_flags[1]
  for line_start, tag, colon_pos, done_pos in
    gmatch_at_start_of_line(text, "()[^\n]-%-%-%-[^%S\n]*@plugin[^%S\n]+([%a%-]+)[^%S\n]*():?()")--[[@as fun(): integer, string, integer, integer]]
  do
    local flags
    if colon_pos == done_pos then
      flags = module_flags.all
    else
      flags = module_flags.none
      repeat
        local module_name, p_comma
        module_name, p_comma, done_pos = text:match("^[^%S\n]*([%a_]+)[^%S\n]*(),?()", done_pos)
        if not module_name then break end -- Syntax error: missing module name after ':' or ','.
        local module_flag = module_flags[module_name]
        if not module_flag then module_flag = 0 end -- Invalid 'module_name'.
        -- if band(flags, module_flag) ~= 0 then end -- Duplicate 'module_name' in list.
        flags = bor(flags, module_flag)
      until p_comma == done_pos
    end

    if tag == "disable-next-line" then
      local next_line_start, next_line_finish = text:match("\n()[^\n]*()", done_pos)
      if next_line_start then
        add_disabled_flags(next_line_start, bor(current_flags, flags))
        add_disabled_flags(next_line_finish, current_flags)
      end
    elseif tag == "disable-line" then
      if disabled_positions[disabled_positions_count - 1] == line_start then
        -- If the previous line had a disable-next-line, combine them.
        disabled_flags[disabled_positions_count - 1] = bor(disabled_flags[disabled_positions_count - 1], flags)
      else
        add_disabled_flags(line_start, bor(current_flags, flags))
        add_disabled_flags(text:match("^[^\n]*()", done_pos), current_flags)
      end
    elseif tag == "disable" then
      current_flags = bor(current_flags, flags)
      add_disabled_flags(colon_pos, current_flags)
    elseif tag == "enable" then
      current_flags = band(current_flags, bnot(flags))
      add_disabled_flags(colon_pos, current_flags)
    else
      -- Invalid tag.
    end
  end
end

---@type table<integer, Diff>
local diff_finish_pos_to_diff_map = {}

---@param text string
local function on_pre_process_file(text)
  find_plugin_disable_annotations(text)
end

local function on_post_process_file()
  local next = next
  local k = next(diff_finish_pos_to_diff_map)
  while k do
    local next_k = next(diff_finish_pos_to_diff_map, k)
    diff_finish_pos_to_diff_map[k] = nil
    k = next_k
  end
  clean_up_disabled_data()
end

---it's string.gmatch, but anchored at the start of a line
---it is not supported to capture the entire match by not defining any captures
---in that case explicitly define the capture. (Because a newline might be added at the start)
---
---**important** note: if the given pattern contains `\n` and the second line
---could be a match for the first lien of the pattern (like if you have `foo()\nfoo`)
---then the second match returned by the returned iterator would actually start at the
---`foo` that was already included in the first match.
---(so `foo()\nfoo` with the input `foo\nfoo\nfoo` would result in 2 matches instead of 1)
---this _could_ be fixed, however it is not worth the complexity and performance.
---not as long as there is no use for it
---
---the same goes for the first oddity about matching the whole pattern. it could be fixed, but is not worth it
---@param s string
---@param pattern string
---@return fun(): string|integer, ...
function gmatch_at_start_of_line(s, pattern)
  local first = true
  local unpack = table.unpack
  ---@type fun(): string|integer, ...
  local gmatch_iterator = s:gmatch("\n"..pattern)
  return function()
    if first then
      first = false
      local result = {s:match("^"..pattern)}
      if result[1] then
        return unpack(result)
      end
    end
    return gmatch_iterator()
  end
end

---extends the text of a ChainDiffElem or setting it if it is nil
---@param elem ChainDiffElem
---@param text string
local function extend_chain_diff_elem_text(elem, text)
  if elem.text then
    elem.text = elem.text.. text
  else
    elem.text = text
  end
end

---@param diffs Diff.ArrayWithCount
---@param start integer
---@param finish integer
---@param replacement string
local function add_diff(diffs, start, finish, replacement)
  -- Finish is treated as including, but we want excluding for consistency with chain diffs.
  finish = finish - 1
  local count = diffs.count
  count = count + 1
  diffs.count = count
  ---@type Diff
  local diff = {
    start = start,
    finish = finish,
    text = replacement,
  }
  diffs[count] = diff
  diff_finish_pos_to_diff_map[finish] = diff
end

---@param diffs Diff.ArrayWithCount
---@param position integer @ Position of a single character, instead of start and finish.
---@param prev_char string @ The character at the given position, before replacements.
---@param addition string @ The string to append after `prev_char`.
local function add_or_append_diff(diffs, position, prev_char, addition)
  local diff = diff_finish_pos_to_diff_map[position]
  if diff then
    diff.text = diff.text..addition
  else
    return add_diff(diffs, position, position + 1, prev_char..addition)
  end
end

---@param diffs Diff.ArrayWithCount
local function remove_diff(diffs)
  local count = diffs.count
  diffs[count] = nil
  diffs.count = count - 1
end

---if 'source' is a string wrapped in "" or '' get the string inside those quotes
---otherwise returns nil
---@param source string
---@return string|false
local function try_parse_string_literal(source)
  ---@type string, integer
  local str, f_str = source:match("^[\"']([^\"']*)[\"']%s*()")
  return f_str == #str and str
end

---@param chain_diff ChainDiffElem[]
---@param i_in_chain_diff number @ index of the elem in `chain_diff` that represents the source
---@param source string
---@param is_literal_contents? boolean @ is 'source' the contents of a literal string already
---@param do_not_pad_with_white_space? boolean @ when using literal identifiers they get padded with a blank space to acuminate for replacing the quotes. If `true`, that padding is not added
local function use_source_to_index(chain_diff, i_in_chain_diff, source, is_literal_contents, do_not_pad_with_white_space)
  local contents = is_literal_contents and source or try_parse_string_literal(source)
  if contents and contents:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
    -- source is a literal string and a valid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], ".")
    chain_diff[i_in_chain_diff].text = (do_not_pad_with_white_space and "" or " ")..contents
  else
    -- source is a variable, expression or literal string which is an invalid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], "[")
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff + 1], "]")
    -- leaves chain_diff[i_in_chain_diff] untouched
  end
end

---@class ChainDiffElem
---@field i integer @ index within the text of the file
---@field text nil|string @ text replacing from this elem's `i` including to the next elem's `i` excluding. When nil no diff will be created. If the last elem has `text` it will treat it as if there was another elem after with with the same `i`

---creates diffs according to the chain_diff. See ChainDiffElem class description for how it works
---@param chain_diff ChainDiffElem[]
---@param diffs Diff.ArrayWithCount
local function add_chain_diff(chain_diff, diffs)
  local prev_chain_diff_elem = chain_diff[1]
  if not prev_chain_diff_elem then return end
  for i = 2, #chain_diff do
    local chain_diff_elem = chain_diff[i]
    if prev_chain_diff_elem.text then
      local count = diffs.count
      count = count + 1
      diffs.count = count
      local finish = chain_diff_elem.i - 1 -- finish is treated as including, which we don't want
      ---@type Diff
      local diff = {
        start = prev_chain_diff_elem.i,
        finish = finish,
        text = prev_chain_diff_elem.text,
      }
      diffs[count] = diff
      diff_finish_pos_to_diff_map[finish] = diff
    end
    prev_chain_diff_elem = chain_diff_elem
  end
  if prev_chain_diff_elem.text then
    local count = diffs.count
    count = count + 1
    diffs.count = count
    local finish = prev_chain_diff_elem.i - 1
    ---@type Diff
    local diff = {
      start = prev_chain_diff_elem.i,
      finish = finish,
      text = prev_chain_diff_elem.text,
    }
    diffs[count] = diff
    diff_finish_pos_to_diff_map[finish] = diff
  end
end

return {
  module_flags = module_flags,
  is_disabled = is_disabled,
  reset_is_disabled_to_file_start = reset_is_disabled_to_file_start,
  on_pre_process_file = on_pre_process_file,
  on_post_process_file = on_post_process_file,
  gmatch_at_start_of_line = gmatch_at_start_of_line,
  add_diff = add_diff,
  add_or_append_diff = add_or_append_diff,
  remove_diff = remove_diff,
  add_chain_diff = add_chain_diff,
  extend_chain_diff_elem_text = extend_chain_diff_elem_text,
  try_parse_string_literal = try_parse_string_literal,
  use_source_to_index = use_source_to_index,
}
