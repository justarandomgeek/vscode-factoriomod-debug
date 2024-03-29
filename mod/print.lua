local __DebugAdapter = __DebugAdapter
local debug = debug
local variables = require("__debugadapter__/variables.lua") -- uses pcall
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
require("__debugadapter__/evaluate.lua") -- uses pcall
local json = require('__debugadapter__/json.lua')
local print = print
local type = type
local next = next
local setmetatable = setmetatable
local getmetatable = getmetatable

---@class DebugAdapter.Print
local DAprint = {}

---@param body {output:string, variablesReference?:number, category?:"console"|"important"|"stdout"|"stderr"}
---@param info? {source:string, currentline:number}
function DAprint.outputEvent(body, info)
  local daline

  local source
  local dasource
  if info then
    daline = info.currentline and "\xEF\xB7\x92"..info.currentline;

    source = normalizeLuaSource(info.source)
    dasource = {
      name = source,
      path = "\xEF\xB7\x91"..source,
    }
    if source == "=(dostring)" then
      local sourceref = variables.sourceRef(info.source)
      if sourceref then
        dasource = sourceref
      end
    end
  end

  print("\xEF\xB7\x95"..json.encode{
    event="output",
    body={
      output=body.output,
      category=body.category,
      variablesReference=body.variablesReference,
      source=dasource,
      line=daline,
    }})
end

---@param expr any
---@param alsoLookIn? table
---@param upStack? integer
---@param category? "console"|"important"|"stdout"|"stderr"
---@param noexprs? boolean
function DAprint.print(expr,alsoLookIn,upStack,category,noexprs)
  local texpr = type(expr)
  ---@type string
  local result
  ---@type integer
  local ref
  if texpr == "string" then
    ---@type any[]
    local exprs
    result,exprs = __DebugAdapter.stringInterp(expr,3,alsoLookIn,"print")
    if next(exprs) and not noexprs then
      setmetatable(exprs,{
        __debugline = function() return result end,
        __debugtype = "DebugAdapter.PrintResult",
      })

      local v = variables.create(nil,{exprs}, nil)
      ref = v.variablesReference
    end
  elseif variables.translate and texpr == "table" and (expr.object_name == "LuaProfiler" or (not getmetatable(expr) and #expr>=1 and type(expr[1])=="string")) then
    result = "\xEF\xB7\x94"..variables.translate(expr)
  else
    if texpr == "table" then
      expr = {expr}
    end
    local v = variables.create(nil,expr, nil)
    result = v.value
    ref = v.variablesReference
  end

  local body = {
    category = category or "console",
    output = result,
    variablesReference = ref,
  }
  local info
  if upStack then
    if upStack ~= -1 then
      upStack = upStack + 1
      info = debug.getinfo(upStack,"lS")
    end
  else
    info = debug.getinfo(2,"lS")
  end
  __DebugAdapter.outputEvent(body, info)
end
return DAprint