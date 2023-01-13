local string = string
local sformat = string.format
local sbyte = string.byte
local tconcat = table.concat
local mhuge = math.huge
local rawget = rawget
local next = next
local pairs = pairs
local tostring = tostring
local type = type

---@param f function
---@return function
local stepIgnore = __DebugAdapter and __DebugAdapter.stepIgnore or function(f) return f end


---@class DebugAdapter.json
local json = {}

local function encode_nil()
  return "null"
end

local escape_char_map = {
  [ "\\" ] = "\\\\", [ "\"" ] = "\\\"", [ "\b" ] = "\\b",
  [ "\f" ] = "\\f", [ "\n" ] = "\\n", [ "\r" ] = "\\r",
  [ "\t" ] = "\\t", }

---JSON Escape a single character
---@param c string A single character to escape
---@return string escaped The JSON escaped character
  local function escape_char(c)
  return escape_char_map[c] or sformat("\\u%04x", sbyte(c))
end
stepIgnore(escape_char)


---Output a string formatted as a JSON string
---@param val string
---@return string json
local function encode_string(val)
  return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

---Output a number formatted as a JSON number
---@param val number
---@return string json
local function encode_number(val)
  -- Check for NaN, -inf and inf
  if val ~= val then
    return [["NaN"]]
  elseif val <= -mhuge then
    return [["-Infinity"]]
  elseif val >= mhuge then
    return [["Infinity"]]
  else
    return sformat("%.14g", val)
  end
end

local encode;

---Output a table formatted as a JSON object or array
---@param val table
---@param stack table<table,true>|nil List of already-seen tables
---@return string json
local function encode_table(val, stack)
  ---@type string[]
  local res = {}
  stack = stack or {}

  -- Circular reference?
  if stack[val] then return [["<circular>"]] end

  stack[val] = true

  local is_array = false
  if rawget(val, 1) ~= nil or next(val) == nil then
    -- Treat as array -- check keys are valid and it is not sparse
    is_array = true
    local n = 1
    for k,v in pairs(val) do
      if k ~= n then
        is_array = false
        break
      end
      res[k] = encode(v, stack)
      n = n + 1
    end
  end

  if is_array then
    -- Encode
    stack[val] = nil
    return "[" .. tconcat(res, ",") .. "]"
  else
    -- Treat as an object
    local i = 1
    for k, v in pairs(val) do
      res[i] = encode(tostring(k), stack) .. ":" .. encode(v, stack)
      i = i + 1
    end
    stack[val] = nil
    return "{" .. tconcat(res, ",") .. "}"
  end
end

local type_encode = stepIgnore({
  ["nil"] = encode_nil,
  ["string"] = encode_string,
  ["table"] = encode_table,
  ["boolean"] = tostring,
  ["number"] = encode_number,
})

---Output a value formatted as JSON
---@generic T : table|string|number|boolean|nil
---@param value T
---@param stack table|nil List of already-seen tables
---@return string json
function encode(value, stack)
  local t = type(value)
  local f = type_encode[t]
  if f then
    return f(value, stack)
  else
    return '"<'..t..'>"'
  end
end
stepIgnore(encode)

json.encode = encode
return json