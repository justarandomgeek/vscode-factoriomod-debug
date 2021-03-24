--##

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

---@param diffs Diff[]
---@param start number
---@param finish number
---@param replacement string
local function add_diff(diffs, start, finish, replacement)
  diffs[#diffs+1] = {
    start = start,
    finish = finish - 1,
    text = replacement,
  }
end

---if 'source' is a string wrapped in "" or '' get the string inside those quotes
---otherwise returns nil
---@param source string
---@return string|nil
local function try_parse_string_literal(source)
  ---@type string|number
  local str, f_str = source:match("^[\"']([^\"']*)[\"']%s*()")
  return f_str == #str and str
end

---@param chain_diff ChainDiffElem[]
---@param i_in_chain_diff number @ index of the elem in `chain_diff` that represents the source
---@param source string
---@param is_literal_contents? boolean @ is 'source' the contents of a literal string already
local function use_source_to_index(chain_diff, i_in_chain_diff, source, is_literal_contents)
  local contents = is_literal_contents and source or try_parse_string_literal(source)
  if contents and contents:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
    -- source is a literal string and a valid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], ".")
    chain_diff[i_in_chain_diff].text = contents
  else
    -- source is a variable, expression or literal string which is an invalid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], "[")
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff + 1], "]")
    -- leaves chain_diff[i_in_chain_diff] untouched
  end
end

---@class ChainDiffElem
---@field i number @ index within the text of the file
---@field text nil|string @ text replacing from this elem's `i` including to the next elem's `i` excluding. When nil no diff will be created. If the last elem has `text` it will treat it as if there was another elem after with with the same `i`

---creates diffs according to the chain_diff. See ChainDiffElem class description for how it works
---@param chain_diff ChainDiffElem[]
---@param diffs Diff[]
local function add_chain_diff(chain_diff, diffs)
  local prev_chain_diff_elem = chain_diff[1]
  if not prev_chain_diff_elem then return end
  for i = 2, #chain_diff do
    local chain_diff_elem = chain_diff[i]
    if prev_chain_diff_elem.text then
      diffs[#diffs+1] = {
        start = prev_chain_diff_elem.i,
        finish = chain_diff_elem.i - 1, -- finish is treated as including, which we don't want
        text = prev_chain_diff_elem.text,
      }
    end
    prev_chain_diff_elem = chain_diff_elem
  end
  if prev_chain_diff_elem.text then
    diffs[#diffs+1] = {
      start = prev_chain_diff_elem.i,
      finish = prev_chain_diff_elem.i - 1,
      text = prev_chain_diff_elem.text,
    }
  end
end

return {
  add_diff = add_diff,
  add_chain_diff = add_chain_diff,
  extend_chain_diff_elem_text = extend_chain_diff_elem_text,
  try_parse_string_literal = try_parse_string_literal,
  use_source_to_index = use_source_to_index,
}
