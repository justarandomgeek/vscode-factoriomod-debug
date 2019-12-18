local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")

local variables = {
  refs = {},

}



---@param frameId number
---@param name string
---@return number
function variables.scopeRef(frameId,name)
  local id = #variables.refs+1
  variables.refs[id] = {
    type = name,
    frameId = frameId,
  }
  return id
end

---@param table table
---@param mode string "pairs"|"ipairs"|"count"
---@return number
function variables.tableRef(table, mode)
  for id,varRef in pairs(variables.refs) do
    if varRef.table == table then return id end
  end
  local id = #variables.refs+1
  variables.refs[id] = {
    type = "Table",
    table = table,
    useIpairs = mode == "ipairs",
    useCount = mode == "count",
  }
  return id
end

---@param luaObject LuaObject
---@param classname string
---@return number
function variables.luaObjectRef(luaObject,classname)
  if luaObjectInfo.noExpand[classname] then return 0 end
  for id,varRef in pairs(variables.refs) do
    if varRef.object == luaObject then return id end
  end
  local id = #variables.refs+1
  variables.refs[id] = {
    type = "LuaObject",
    object = luaObject,
    classname = classname,
  }
  return id
end

---@param name any
---@param value any
---@return Variable
function variables.create(name,value)
  local namestr = serpent.line(name,{maxlevel = 1, nocode = true, metatostring=true})
  local vtype = type(value)
  if vtype == "table" then
    -- only check __self and metatable, since top level objects (game, script, etc) don't have the magic string in .isluaobject
    if type(value.__self) == "userdata" and getmetatable(value) == "private" then
      vtype = luaObjectInfo.classname(value)
      if vtype == "LuaCustomTable" then
        return {
          name = namestr,
          value = ("%d items"):format(#value),
          type = vtype,
          variablesReference = variables.tableRef(value),
        }
      else
        local lineitem = luaObjectInfo.lineItem[vtype]
        local val = vtype
        if lineitem then
          local success,result = pcall(lineitem,value)
          if success then val = result end
        end
        return {
          name = namestr,
          value = val,
          type = vtype,
          variablesReference = variables.luaObjectRef(value,vtype),
        }
      end
    else
      local lineitem = serpent.line(value,{maxlevel = 1, nocode = true, metatostring=true})
      local mt = getmetatable(value)
      if mt and mt.__debugline then
        lineitem = mt.__debugline(value)
      end
      return {
        name = namestr,
        value = lineitem,
        type = vtype,
        variablesReference = variables.tableRef(value),
      }
    end
  elseif vtype == "function" then
    local info = debug.getinfo(value, "nS")
    local funcdesc = "function"
    if info.what == "C" then
      funcdesc = "C function"
    elseif info.what == "Lua" then
      funcdesc = ("Lua function @%s:%d"):format(info.source and normalizeLuaSource(info.source),info.linedefined)
    end
    return {
      name = namestr,
      value = funcdesc,
      type = vtype,
      variablesReference = 0,
    }
  else
    return {
      name = namestr,
      value = serpent.line(value),
      type = vtype,
      variablesReference = 0,
    }
  end
end

return variables