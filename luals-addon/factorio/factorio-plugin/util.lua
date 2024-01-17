--##

local floor_div = __plugin_dev
  and function(left, right) return math.floor(left / right) end
  or load("return function(left, right) return left // right end")()
local band = __plugin_dev and bit32.band or load("return function(left, right) return left & right end")()
local bor = __plugin_dev and bit32.bor or load("return function(left, right) return left | right end")()
local bnot = __plugin_dev and bit32.bnot or load("return function(value) return ~value end")()

---@type table<integer, Diff>
local diff_finish_pos_to_diff_map = {}

local function clean_up_diff_finished_pos_to_diff_map()
  local next = next
  local k = next(diff_finish_pos_to_diff_map)
  while k do
    local next_k = next(diff_finish_pos_to_diff_map, k)
    diff_finish_pos_to_diff_map[k] = nil
    k = next_k
  end
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
local function gmatch_at_start_of_line(s, pattern)
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

---Always contains 1 element.\
---This element must exist because the binary search expects at least 1 element. It searches for a value <=
---the given position, but this has to be 0 because 1 could be an index in the actual code already. So this 0
---basically defines the range starting at "before the code" until the first position, exclusive.
---@type integer[]
local ranges = {0}
---@type PluginDisableFlags[]
local ranges_flags = {module_flags.none} -- Indexes match up with `disabled_positions`.
local ranges_count = 1
local ranges_current_lower_bound = 0 -- Zero based.

---@param position integer @ The position to search for in `ranges`.
---@param lower_bound integer @ Zero based, inclusive.
---@param upper_bound integer @ Zero based, exclusive.
---@param start_index integer? @ Zero based. Must be within bounds.
---@return integer found_index @ The position at this index is the greatest position which is <= `position`.
local function binary_search(position, lower_bound, upper_bound, start_index)
  local i = start_index or floor_div(lower_bound + upper_bound, 2)
  while true do
    local pos = ranges[i + 1]
    if pos <= position then
      lower_bound = i + 1 -- It's inclusive, so +1 to make it not check this index twice.
    else
      upper_bound = i -- It's exclusive, it won't check this index twice.
    end
    if lower_bound == upper_bound then break end
    i = floor_div(lower_bound + upper_bound, 2)
  end
  return lower_bound - 1
end

---@param position integer
---@param flag PluginDisableFlags
---@return boolean
local function is_disabled(position, flag)
  local lower_bound = ranges_current_lower_bound -- Zero based, inclusive.
  local upper_bound = ranges_count -- Zero based, exclusive.
  local start_index = floor_div(lower_bound + upper_bound, 2) -- Zero based.
  -- Try close to the lower bound first, since text is processed front to back.
  start_index = math.min(start_index, lower_bound + 8) -- TODO: check if this number requires tweaking.
  local index = binary_search(position, lower_bound, upper_bound, start_index)
  ranges_current_lower_bound = index
  local flags = ranges_flags[index + 1] -- + 1 to go from zero to one based.
  return band(flags, flag) ~= 0
end

local function reset_is_disabled_to_file_start()
  ranges_current_lower_bound = 0
end

local function clean_up_disabled_data()
  -- Not `nil`ing out `ranges` nor `ranges_flags` because count is tracked separately.
  -- Lua doesn't shrink tables anyway, and even if LuaLS's version of Lua does shrink
  -- tables, we don't want it to shrink these tables, because they're constantly reused.
  ranges_count = 1
  ranges_current_lower_bound = 0
end

---@param position integer @ One based.
---@param flags PluginDisableFlags
local function append_range_flags(position, flags)
  if ranges_flags[ranges_count] == flags then return end
  ranges_count = ranges_count + 1
  ranges[ranges_count] = position
  ranges_flags[ranges_count] = flags
end

---@param index integer @ Zero based. Can be past `ranges_count`. Otherwise must be
---the index of a position which is equal or adjacent to the given position arg.
---@param position integer @ One based.
---@param flags PluginDisableFlags
---@return integer? modified_index @ Non `nil` when flags got set at a different `index`.
---(Can also still return the same index as given by the `index` arg.)
local function set_flags_at(index, position, flags)
  if index > ranges_count then
    -- assert(index == ranges_count + 1) -- This assert is true, but it doesn't really matter.
    return append_range_flags(position, flags)
  end
  local pos_at_index = ranges[index]
  if pos_at_index == position then -- Same position, just overwrite.
    -- Even if this causes 2 consecutive ranges to have the same flags, it's not worth using `table.remove`.
    ranges_flags[index] = flags
    return
  end
  if pos_at_index < position then -- Greater position, insert after `index`.
    if index == ranges_count then -- Appending is faster than inserting.
      return append_range_flags(position, flags) -- Tail call.
    end
    index = index + 1
  end
  if ranges_flags[index - 1] == flags then return end -- Phew, nothing to do, don't have to insert.
  if ranges_flags[index] == flags then -- Phew, can just move the next range to start a bit earlier.
    ranges[index] = position
    return index
  end
  -- Alright fine, has to insert.
  ranges_count = ranges_count + 1
  table.insert(ranges, index, position)
  table.insert(ranges_flags, index, flags)
  return index
end

---@param start_position integer @ One based, inclusive. Is allowed to be `== ranges[ranges_count]`.
---@param stop_position integer? @ Default: infinity. One based, exclusive. Must be > `start_position`.
---@param start_flags PluginDisableFlags
---@param stop_flags PluginDisableFlags
local function append_flags_range(start_position, stop_position, start_flags, stop_flags)
  set_flags_at(ranges_count, start_position, start_flags) -- Will overwrite at `ranges_count` or append.
  if stop_position then
    return append_range_flags(stop_position, stop_flags) -- Tail call.
  end
end

---@param start_position integer @ One based, inclusive.
---@param stop_position integer? @ Default: infinity. One based, exclusive. Must be > `start_position`.
---@param flags_to_combine PluginDisableFlags
---@param binary_op fun(left: integer, right: integer): integer
local function combine_flags_for_range(start_position, stop_position, flags_to_combine, binary_op)
  if start_position >= ranges[ranges_count] then -- Update last or append.
    local original_flags = ranges_flags[ranges_count]
    local combined_flags = binary_op(original_flags, flags_to_combine)
    return append_flags_range(start_position, stop_position, combined_flags, original_flags) -- Tail call.
  end

  -- +1 to make it 1 based.
  local index = binary_search(start_position, ranges_current_lower_bound, ranges_count) + 1
  local original_flags = ranges_flags[index] -- The flags to restore at `stop_position`.
  index = set_flags_at(index, start_position, binary_op(original_flags, flags_to_combine)) or index

  stop_position = stop_position or (1/0)
  index = index + 1
  while index <= ranges_count do
    if ranges[index] >= stop_position then break end
    original_flags = ranges_flags[index] -- Update the flags to restore.
    ranges_flags[index] = binary_op(original_flags, flags_to_combine)
    index = index + 1
  end

  if stop_position ~= (1/0) then
    if ranges[index] == stop_position then return end -- Do not overwrite, only insert or append.
    -- The reason is that if there already is a range start at this stop_index, then the range
    -- that just got set is already terminated properly. Overwriting would just break the next range.
    return set_flags_at(index, stop_position, original_flags) -- Tail call.
  end
end

---@param start_position integer
---@param stop_position integer? @ Default: infinity. One based, exclusive. Must be > `start_position`.
---@param flags_to_add PluginDisableFlags
local function add_flags_to_range(start_position, stop_position, flags_to_add)
  return combine_flags_for_range(start_position, stop_position, flags_to_add, bor) -- Tail call.
end

---@param start_position integer
---@param stop_position integer? @ Default: infinity. One based, exclusive. Must be > `start_position`.
---@param flags_to_remove PluginDisableFlags
local function remove_flags_from_range(start_position, stop_position, flags_to_remove)
  return combine_flags_for_range(start_position, stop_position, bnot(flags_to_remove), band) -- Tail call.
end

local module_name_intellisense = [[
__plugin_dummy(({---@diagnostic disable-line:undefined-global
---Removal of `/c` and friends at the start of a line.
command_line=true,
---Replacement of expressions involving `global` to help the language sever distinguish global tables between different mods.
global=true,
---Rearrangement of `obj.object_name == "LuaEntity"` for the language server to perform type narrowing, same as how `type()` works.
object_name=true,
---Insertion of `@param` tag for inline event registrations, with support for flib and stdlib.
on_event=true,
---Hacks for `remote.add_interface` to look like table assignments, allowing the remote_add hack to provide intellisense.
remote_add=true,
---Hacks for `remote.call` to look like table indexes into a fake table with all found remote interfaces to provide intellisense.
remote_call=true,
---Mainly removal of the `__` in `require("__mod-name__.file")` for better cross mod file resolution.
require=true,
}).]]

local parse_strings_comments_and_annotations
do
  ---@type string
  local source
  ---@type Diff.ArrayWithCount
  local diffs
  ---@type integer?
  local cursor
  ---@type integer
  local line_start

  ---`cursor` must not be `nil`.\
  ---check if the next character(s) are equal to the given string
  ---@param query string
  ---@return boolean
  local function peek(query)
    ---@cast cursor -nil
    if cursor + #query > #source then return false end
    return source:sub(cursor, cursor + #query - 1) == query
  end

  ---`cursor` must not be `nil`.
  ---@param query string
  ---@return boolean
  local function take(query)
    ---@cast cursor -nil
    if not peek(query) then return false end
    cursor = cursor + #query
    return true
  end

  ---Parse a opening long bracket, like `[[` or `[=[`
  ---Assumes the first bracket has already been consumed.
  ---@return integer? level @ `nil` when there isn't a valid open bracket.
  local function parse_long_bracket_open()
    -- Consume all the '='s
    local match = source:match("^=*%[()", cursor)
    if not match then return nil end
    local level = match - cursor - 1
    cursor = match
    return level
  end

  ---@param start_position integer
  ---@param quote `"`|`'`
  local function parse_short_string(start_position, quote)
    while cursor do
      cursor = string.match(source, "()[\\"..quote.."\r\n]", cursor)
      if not cursor then return end
      if not take("\\") then
        cursor = cursor + 1 -- Consume quote or newline (Don't care about 2 char wide newlines).
        add_flags_to_range(start_position, cursor, module_flags.all)
        return
      end
      -- `\` has been consumed.
      local escaped_char = source:sub(cursor, cursor)
      cursor = cursor + 1 -- Consume escaped char.
      if escaped_char == "z" then
        cursor = string.match(source, "^%s*()", cursor)
        goto continue
      end
      if escaped_char == "\n" or escaped_char == "\r" then
        local next_char = source:sub(cursor, cursor)
        if (next_char == "\n" or next_char == "\r") and next_char ~= escaped_char then
          -- Handle `\r\n` and `\n\r` in source files. They are both treated as a single newline in Lua.
          -- (And they are converted to just `\n`, but we don't care about that here.)
          cursor = cursor + 1
        end
        goto continue
      end
      -- All other escaped characters, valid or not, don't require special handling.
      ::continue::
    end
  end

  ---@param start_position integer
  ---@param level integer @ The amount of `=` between the square brackets
  local function parse_long_string(start_position, level)
    cursor = string.match(source, "%]"..string.rep("=", level).."%]()", cursor)
    add_flags_to_range(start_position, cursor, module_flags.all)
  end

  ---@return PluginDisableFlags
  local function parse_module_flags_list()
    local flags = module_flags.none
    repeat
      local s_module_name, module_name, f_module_name, p_comma
      local start_pos = cursor
      ---@type integer, string, integer, integer, integer
      s_module_name, module_name, f_module_name, p_comma, cursor
        = string.match(source, "^[^%S\r\n]*()([%a_]*)()[^%S\r\n]*(),?()", cursor)
      local module_flag = module_flags[module_name]
      if not module_flag then-- Invalid 'module_name'.
        -- Add a newline followed by a function call (to make it valid both as a statement and in
        -- table constructors). The first argument to the call is a table constructor wrapped in
        -- '()' followed by '.' to instantly index into that constructed table. The table contains
        -- all the valid module names with a short comment describing what that module does.
        add_diff(diffs, start_pos - 1, start_pos,
          string.sub(source, start_pos - 1, start_pos - 1).."\n"..module_name_intellisense
        )
        -- Must be split into 2 diffs like this to actually get the intellisense from the "table index".
        -- Using an undefined global to get a warning. Extra ',' in the argument list to ensure
        -- there is an error visible to the programmer, even with undefined global warnings disabled.
        -- ';' at the end because it is valid both in statement and in table constructor context.
        add_diff(diffs, s_module_name, f_module_name,
          module_name..","..(module_name == "" and "missing" or "invalid").."_module_name,);--"
        )
        goto continue
      end
      -- if band(flags, module_flag) ~= 0 then end -- Duplicate 'module_name' in list.
      flags = bor(flags, module_flag)
      ::continue::
    until p_comma == cursor
    return flags
  end

  local valid_tags_lut = {
    ["disable-next-line"] = true,
    ["disable-line"] = true,
    ["disable"] = true,
    ["enable"] = true,
  }

  local function parse_plugin_annotation()
    ---@cast cursor -nil
    ---@type integer, string, integer, integer
    local s_tag, tag, colon_pos, done_pos = string.match(source, "^[^%S\r\n]*()([%a%-]*)[^%S\r\n]*():?()", cursor)
    if (cursor == s_tag and tag == "")
      or (cursor ~= s_tag and not valid_tags_lut[tag])
    then
      add_diff(diffs, cursor - #"plugin", cursor, "diagnostic") -- To get disable/enable etc suggestions.
      return
    end
    if cursor == s_tag then return end -- It isn't actually an ---@plugin annotation.

    cursor = done_pos
    local flags = colon_pos == done_pos
      and module_flags.all -- No colon.
      or parse_module_flags_list() -- Has colon, must have a list of flags.

    if flags == module_flags.none then return end -- Short circuit.

    if tag == "disable-next-line" then
      -- TODO: fix this, with \r\n it thinks the next line is just empty.
      local next_line_start, next_line_finish = string.match(source, "[\r\n]()[^\r\n]*()", done_pos)
      if next_line_start then
        add_flags_to_range(next_line_start, next_line_finish, flags)
      end
    elseif tag == "disable-line" then
      add_flags_to_range(line_start, string.match(source, "^[^\r\n]*()", done_pos), flags)
    elseif tag == "disable" then
      add_flags_to_range(cursor, nil, flags)
    elseif tag == "enable" then
      remove_flags_from_range(cursor, nil, flags)
    else
      error("Impossible tag "..tostring(tag).." because the tag has already been checked using valid_tags_lut.")
    end
  end

  ---@param start_position integer
  local function parse_short_comment(start_position)
    if take("-") then
      cursor = string.match(source, "^[^%S\r\n]*()", cursor)
      if take("@plugin") then
        parse_plugin_annotation()
      end
    end
    -- Technically in Lua newlines are not part of the single line comment anymore,
    -- however this distinction does not matter for us here, in fact this is more efficient
    -- because it can allow for ranges to be combined into 1. Unless the source uses `\r\n`.
    cursor = string.match(source, "[\r\n]()", cursor)
    add_flags_to_range(start_position, cursor, module_flags.all)
  end

  local function parse()
    while cursor do
      local current_char
      -- rapid advance to the next interesting character
      current_char, cursor = string.match(source, "([-[\"'\r\n])()", cursor)
      if not cursor then break end
      local anchor = cursor

      if current_char == "-" then
        if not take("-") then goto continue end
        if not take("[") then
          parse_short_comment(anchor)
          goto continue
        end
        -- `[` has been consumed.
        local level = parse_long_bracket_open()
        if level then
          parse_long_string(anchor, level)
        else
          cursor = cursor - 1 -- Don't consume `[`.
          parse_short_comment(anchor)
        end
      elseif current_char == "[" then
        local level = parse_long_bracket_open()
        if level then
          parse_long_string(anchor, level)
        end
      elseif current_char == '"' or current_char == "'" then
        parse_short_string(anchor, current_char)
      elseif current_char == "\r" or current_char == "\n" then
        line_start = cursor -- The next line starts after the newline character. Cursor has already advanced.
        -- During the creation of `ranges` and `ranges_flags` there can be overlapping ranges,
        -- mainly due to ---@plugin disable-next-line and disable-line.
        -- When this happens, the functions for adding or removing flags for ranges perform
        -- binary searches to find the index to insert at. However since overlapping ranges can
        -- only occur within the current line, once done with a line the lower bound can be shifted up.
        if line_start >= ranges[ranges_count] then
          ranges_current_lower_bound = ranges_count
        else -- There are already ranges on this next line, find the index for the start of the line.
          ranges_current_lower_bound = binary_search(line_start, ranges_current_lower_bound, ranges_count)
        end
      else
        error("Impossible current_char '"..tostring(current_char).."'.")
      end
      ::continue::
    end
  end

  ---Lexically analyze Lua source files for positions of strings and comments.
  ---Notably, this needs to be able to handle 'long brackets', which are context-sensitive.
  ---Also parses ---@plugin annotations.
  ---This is only run once per file.
  ---@param text string
  ---@param diffs_array Diff.ArrayWithCount
  function parse_strings_comments_and_annotations(text, diffs_array)
    source = text
    diffs = diffs_array
    cursor = 1 -- 1 is the first character in the source file.
    line_start = 1
    parse()
    -- If it is currently still inside of a string or comment, that range will not get closed.
    -- That's fine however because nothing will be checking if a position past the end of the
    -- file is code, a string or a comment.
  end
end

---@param text string
---@param diffs Diff.ArrayWithCount
local function on_pre_process_file(text, diffs)
  parse_strings_comments_and_annotations(text, diffs)
end

local function on_post_process_file()
  clean_up_diff_finished_pos_to_diff_map()
  clean_up_disabled_data()
end

return {
  module_flags = module_flags,
  is_disabled = is_disabled,
  reset_is_disabled_to_file_start = reset_is_disabled_to_file_start,
  gmatch_at_start_of_line = gmatch_at_start_of_line,
  add_diff = add_diff,
  add_or_append_diff = add_or_append_diff,
  remove_diff = remove_diff,
  add_chain_diff = add_chain_diff,
  extend_chain_diff_elem_text = extend_chain_diff_elem_text,
  try_parse_string_literal = try_parse_string_literal,
  use_source_to_index = use_source_to_index,
  on_pre_process_file = on_pre_process_file,
  on_post_process_file = on_post_process_file,
}
