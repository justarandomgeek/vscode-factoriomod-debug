--##

---@type table<integer, Diff>
local diff_finish_pos_to_diff_map = {}

local function on_post_process_file()
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

return {
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
