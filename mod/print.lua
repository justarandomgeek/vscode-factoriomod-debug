local __DebugAdapter = __DebugAdapter
local debug = debug
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
require("__debugadapter__/evaluate.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')

---@param expr any
---@param alsoLookIn table
---@param upStack number
---@param category string "console"|"stdout"|"stderr"
function __DebugAdapter.print(expr,alsoLookIn,upStack,category)
  local texpr = type(expr)
  local result,ref
  if texpr == "string" then
    result = __DebugAdapter.stringInterp(expr,3,alsoLookIn,"print")
  elseif variables.translate and texpr == "table" and (expr.object_name == "LuaProfiler" or (not getmetatable(expr) and type(expr[1])=="string")) then
    result = "{LocalisedString "..variables.translate(expr).."}"
  else
    if texpr == "table" then
      expr = {expr}
    end
    local v = variables.create("",expr, nil, true)
    result = v.value
    ref = v.variablesReference
  end

  local body = {
    category = category or "console",
    output = result,
    variablesReference = ref,
  }
  if upStack then
    if upStack ~= -1 then
      upStack = upStack + 1
      local info = debug.getinfo(upStack,"lS")
      if info then
        body.line = info.currentline
        body.source = normalizeLuaSource(info.source)
      end
    end
  else
    local printinfo = debug.getinfo(1,"t")
    if printinfo.istailcall then
      body.line = 1
      body.source = "=(...tailcall...)"
    else
      local info = debug.getinfo(2,"lS")
      body.line = info.currentline
      body.source = normalizeLuaSource(info.source)
    end
  end
  print("DBGprint: " .. json.encode(body))
end