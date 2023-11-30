--##

---@class SharedPluginState
---@field safe_equal_chain string @ A string of `=` for use in multi line comments without interfering with any code.
local state = {}

---@param uri string @ The uri of file
---@param text string @ The content of file
function state.calculate_state_for_file(uri, text)
  local max_equal_chain = 0
  for start, stop in text:gmatch("()=+()")do
    local length = stop - start
    if length > max_equal_chain then
      max_equal_chain = length
    end
  end
  state.safe_equal_chain = string.rep("=", max_equal_chain + 1)
end

return state
