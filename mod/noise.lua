local variables = require("__debugadapter__/variables.lua")
local to_tree_node
local pairs = pairs
local next = next
local tostring = tostring
local debug = debug
local table = table
local tconcat = table.concat

local function expval(ex)
  return { name = ex.type, value = variables.describe(ex.literal_value), children={} }
end

local typevis = {
  ["literal-number"] = expval,
  ["literal-boolean"] = expval,
  ["literal-string"] = expval,
  ["literal-object"] = expval,
  ["literal-expression"] = function (ex)
    return { name = ex.type, children={to_tree_node(ex.literal_value)} }
  end,
  ["procedure-delimiter"] = function (ex)
    return { name = ex.type, children={to_tree_node(ex.expression)} }
  end,
  ["function-application"] = function(ex)
    local args = {}
    if next(ex.arguments) == 1 then
      for i,arg in pairs(ex.arguments) do
        args[i] = to_tree_node(arg)
      end
    else
      for i,arg in pairs(ex.arguments) do
        local argnode = to_tree_node(arg)
        args[#args+1] = argnode
        argnode.id = tostring(i)
        --{
        --  name = tostring(i),
        --  value = argnode.value,
        --  children = { argnode },
        --}
      end
    end
    return {
      name = "function-application",
      value = ex.function_name,
      children = args,
    }
  end,
  ["variable"] = function(ex)
    return { name = "variable", value = ex.variable_name, children={} }
  end,
}

function to_tree_node(ex)
  if not ex then
    return { name = debug.traceback("(nil ex)"), children={} }
  end
  local f = typevis[ex.type]
  if f then
    return f(ex)
  else
    return { name = "(unkown type "..(ex.type or "nil")..")", children={} }
  end
end



local debugline
local function expvalline(ex,short)
  return variables.describe(ex.literal_value,short)
end

local typeline = {
  ["literal-number"] = expvalline,
  ["literal-boolean"] = expvalline,
  ["literal-string"] = expvalline,
  ["literal-object"] = expvalline,
  ["literal-expression"] = function (ex,short)
    return debugline(ex.literal_value,short)
  end,
  ["procedure-delimiter"] = function (ex,short)
    if short then
      return "proc{<...>}"
    else
      return "proc{"..debugline(ex.expression).."}"
    end
  end,
  ["function-application"] = function(ex,short)
    local args = {}
    local argstring
    if next(ex.arguments) == 1 then
      if short then
        argstring = "(<...>)"
      else
        for i,arg in pairs(ex.arguments) do
          args[i] = debugline(arg,true)
        end
        argstring = "("..tconcat(args,", ")..")"
      end
    else
      if short then
        argstring = "{<...>}"
      else
        for k,arg in pairs(ex.arguments) do
          args[#args+1] = tostring(k).."="..debugline(arg,true)
        end
        argstring = "{"..tconcat(args,", ").."}"
      end
    end
    return ex.function_name..argstring
  end,
  ["variable"] = function(ex)
    return ex.variable_name
  end,
}

function debugline(ex,short)
  if not ex then
    return { name = debug.traceback("(nil ex)"), children={} }
  end
  local f = typeline[ex.type]
  if f then
    return f(ex,short)
  else
    return "(unkown type "..(ex.type or "nil")..")"
  end
end

return function(noisemeta)
  function noisemeta.__debugvisualize(ex)
    return {
      kind = {tree=true},
      root = to_tree_node(ex),
    }
  end

  noisemeta.__debugtype = "noise_expression"

  noisemeta.__debugline = function(ex,short)
    if short then
      return "<noise>"
    else
      return "<noise>{"..debugline(ex,short).."}"
    end
  end
end