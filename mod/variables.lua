local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")

-- Trying to expand the refs table causes some problems, so just hide it...
local refsmeta = {
  __debugline = "Debug Adapter Variable ID Cache",
  __debugchildren = function(t) return {
    {
      name = "<hidden>",
      value = "hidden",
      variablesReference = 0,
    },
  } end,
}

local variables = {
  refs = setmetatable({},refsmeta),
}

function variables.clear()
  variables.refs = setmetatable({},refsmeta)
end

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
        local dltype = type(mt.__debugline)
        if dltype == "function" then
          lineitem = mt.__debugline(value)
        elseif dltype == "string" then
          lineitem = mt.__debugline
        end
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

---@param variablesReference integer
---@return Variable[]
function __DebugAdapter.variables(variablesReference)
  local varRef = variables.refs[variablesReference]
  local vars = {}
  if varRef then
    if varRef.type == "Locals" then
      local i = 1
      while true do
        local name,value = debug.getlocal(varRef.frameId,i)
        if not name then break end
        if name:sub(1,1) == "(" then
          name = ("%s %d)"):format(name:sub(1,-2),i)
        end
        vars[#vars + 1] = variables.create(name,value)
        i = i + 1
      end
      i = -1
      while true do
        local name,value = debug.getlocal(varRef.frameId,i)
        if not name then break end
        vars[#vars + 1] = variables.create(("(*vararg %d)"):format(-i),value)
        i = i - 1
      end
    elseif varRef.type == "Upvalues" then
      local func = debug.getinfo(varRef.frameId,"f").func
      local i = 1
      while true do
        local name,value = debug.getupvalue(func,i)
        if not name then break end
        vars[#vars + 1] = variables.create(name,value)
        i = i + 1
      end
    elseif varRef.type == "Table" then
      -- use debug.getmetatable insead of getmetatable to get raw meta instead of __metatable result
      local mt = debug.getmetatable(varRef.table)
      if varRef.useCount then
        --don't show meta on these by default as they're mostly LuaObjects providing count iteration anyway
        if varRef.showMeta == true and mt then
          vars[#vars + 1]{
            name = "<metatable>",
            value = "metatable",
            type = "metatable",
            variablesReference = variables.tableRef(mt),
          }
        end
        for i=1,#varRef.table do
          vars[#vars + 1] = variables.create(i,varRef.table[i])
        end
      else
        if mt and type(mt.__debugchildren) == "function" then
          for _,var in pairs(mt.__debugchildren(varRef.table)) do
            vars[#vars + 1] = var
          end
        else
          -- show metatables by default for table-like objects
          if varRef.showMeta ~= false and mt then
            vars[#vars + 1] = {
              name = "<metatable>",
              value = "metatable",
              type = "metatable",
              variablesReference = variables.tableRef(mt),
            }
          end
          local debugpairs = varRef.useIpairs and ipairs or pairs
          for k,v in debugpairs(varRef.table) do
            vars[#vars + 1] = variables.create(k,v)
          end
        end
      end
    elseif varRef.type == "LuaObject" then
      local object = varRef.object
      if luaObjectInfo.alwaysValid[varRef.classname] or object.valid then
        if varRef.classname == "LuaItemStack" and not object.valid_for_read then
          vars[#vars + 1] = {
            name = [["valid"]],
            value = "true",
            type = "boolean",
            variablesReference = 0,
            presentationHint = { kind = "property", attributes = { "readOnly" } },
          }
          vars[#vars + 1] = {
            name = [["valid_for_read"]],
            value = "false",
            type = "boolean",
            variablesReference = 0,
            presentationHint = { kind = "property", attributes = { "readOnly" } },
          }
        else
          local keys = luaObjectInfo.expandKeys[varRef.classname]
          if not keys then print("Missing keys for class " .. varRef.classname) end
          for key,keyprops in pairs(keys) do
            if keyprops.thisAsTable then
              vars[#vars + 1] = {
                name = "[]",
                value = ("%d items"):format(#object),
                type = varRef.classname .. "[]",
                variablesReference = variables.tableRef(object, keyprops.iterMode),
                presentationHint = { kind = "property", attributes = { "readOnly" } },
              }
            else
              local success,value = pcall(function() return object[key] end)
              if success and value ~= nil then
                local var = variables.create(key,value)
                var.presentationHint = var.presentationHint or {}
                var.presentationHint.kind = "property"
                if keyprops.readOnly then
                  var.presentationHint.attributes = var.presentationHint.attributes or {}
                  var.presentationHint.attributes[#var.presentationHint.attributes + 1] = "readOnly"
                end
                vars[#vars + 1] = var
              end
            end
          end
        end
      else
        vars[#vars + 1] = {
          name = [["valid"]],
          value = "false",
          type = "boolean",
          variablesReference = 0,
          presentationHint = { kind = "property", attributes = { "readOnly" } },
        }
      end
    end
  end
  if #vars == 0 then
    vars[1] = {
      name = "<empty>",
      value = "empty",
      type = "empty",
      variablesReference = 0,
      presentationHint = { kind = "property", attributes = { "readOnly" } },
    }
  end
  print("DBGvars: " .. game.table_to_json({variablesReference = variablesReference, vars = vars}))
end

---@param variablesReference integer
---@param name string
---@param value string
---@param seq number
function __DebugAdapter.setVariable(variablesReference, name, value, seq)
  local varRef = variables.refs[variablesReference]
  if varRef then
    if varRef.type == "Locals" then
      local i = 1
      while true do
        local lname,oldvalue = debug.getlocal(varRef.frameId,i)
        if not lname then break end
        if lname:sub(1,1) == "(" then
          lname = ("%s %d)"):format(lname:sub(1,-2),i)
        end
        if serpent.line(lname) == name then
          local goodvalue,newvalue = serpent.load(value,{safe=false})
          local success = pcall(debug.setlocal,varRef.frameId,i,newvalue)
          if goodvalue and success then
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,oldvalue)}))
          end
        end
        i = i + 1
      end
      i = -1
      while true do
        local vaname,oldvalue = debug.getlocal(varRef.frameId,i)
        if not vaname then break end
        vaname = ("(*vararg %d)"):format(-i)
        if serpent.line(vaname) == name then
          local goodvalue,newvalue = serpent.load(value,{safe=false})
          local success = pcall(debug.setlocal,varRef.frameId,i,newvalue)
          if goodvalue and success then
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,oldvalue)}))
          end
        end
        i = i - 1
      end
    elseif varRef.type == "Upvalues" then
      local func = debug.getinfo(varRef.frameId,"f").func
      local i = 1
      while true do
        local upname,oldvalue = debug.getupvalue(func,i)
        if not upname then break end
        if serpent.line(upname) == name then
          local goodvalue,newvalue = serpent.load(value,{safe=false})
          local success = pcall(debug.setupvalue, func,i,newvalue)
          if goodvalue and success then
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(name,oldvalue)}))
          end
        end
        i = i + 1
      end
    elseif varRef.type == "Table" then
      local goodvalue,newvalue = serpent.load(value,{safe=false})
      local goodname,newname = serpent.load(name,{safe=false})
      if goodname then
        local success = pcall(function() varRef.table[newname] = newvalue end)
        if goodvalue and success then
          print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(newname,newvalue)}))
        else
          local _,oldvalue = pcall(function() return varRef.table[newname] end)
          print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(newname,oldvalue)}))
        end
      end
    elseif varRef.type == "LuaObject" then
      local goodvalue,newvalue = serpent.load(value,{safe=false})
      local goodname,newname = serpent.load(name,{safe=false}) -- special name "[]" isn't valid lua so it won't parse anyway
      if goodname and goodvalue then
        local success = pcall(function() varRef.object[newname] = newvalue end)
        local _,oldvalue = pcall(function() return varRef.object[newname] end)
        print("DBGsetvar: " .. game.table_to_json({seq = seq, body = variables.create(newname,oldvalue)}))
      end
    end
  end
end

return variables