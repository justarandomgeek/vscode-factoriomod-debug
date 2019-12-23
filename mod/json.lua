local json = {}
local table = table
local math = math
local string = string

local function encode_nil()
  return "null"
end

local escape_char_map = {
  [ "\\" ] = "\\\\", [ "\"" ] = "\\\"", [ "\b" ] = "\\b",
  [ "\f" ] = "\\f", [ "\n" ] = "\\n", [ "\r" ] = "\\r",
  [ "\t" ] = "\\t", }
local function escape_char(c)
  return escape_char_map[c] or string.format("\\u%04x", c:byte())
end

local function encode_string(val)
  return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

local function encode_number(val)
  -- Check for NaN, -inf and inf
  if val ~= val then
    return "0/0"
  elseif val <= -math.huge then
    return "-1/0"
  elseif val >= math.huge then
    return "1/0"
  else
    return string.format("%.14g", val)
  end
end

local encode;

local function encode_table(val, stack)
  local res = {}
  stack = stack or {}

  -- Circular reference?
  if stack[val] then return [["<circular>"]] end

  stack[val] = true

  local is_array = false
  if rawget(val, 1) ~= nil or next(val) == nil then
    -- Treat as array -- check keys are valid and it is not sparse
    is_array = true
    local n = 0
    for k in pairs(val) do
      if type(k) ~= "number" then
        is_array = false
        break
      end
      n = n + 1
    end
    if n ~= #val then
      is_array = false
    end
  end

  if is_array then
    -- Encode
    for i, v in ipairs(val) do
      table.insert(res, encode(v, stack))
    end
    stack[val] = nil
    return "[" .. table.concat(res, ",") .. "]"
  else
    -- Treat as an object
    for k, v in pairs(val) do
      table.insert(res, encode(tostring(k), stack) .. ":" .. encode(v, stack))
    end
    stack[val] = nil
    return "{" .. table.concat(res, ",") .. "}"
  end
end

local type_encode = {
  ["nil"] = encode_nil,
  ["string"] = encode_string,
  ["table"] = encode_table,
  ["boolean"] = tostring,
  ["number"] = encode_number,
}

function encode(value, stack)
  local t = type(value)
  local f = type_encode[t]
  if f then
    return f(value, stack)
  else
    return [["<badtype>"]]
  end
end

json.encode = encode
return json