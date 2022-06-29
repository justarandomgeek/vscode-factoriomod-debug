local require = require
-- force canonical name require to ensure only one instance of variables.refs
if ... ~= "__debugadapter__/variables.lua" then
  return require("__debugadapter__/variables.lua")
end

if data then
  -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
  local reg = debug.getregistry()
  ---@type DAvarslib
  local regvars = reg.__DAVariables
  if regvars then return regvars end
end

local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json_encode = require("__debugadapter__/json.lua").encode
local iterutil = require("__debugadapter__/iterutil.lua")

local __DebugAdapter = __DebugAdapter
local debug = debug
local table = table
local setmetatable = setmetatable
local getmetatable = getmetatable
local rawget = rawget
local next = next
local pairs = pairs
local print = print
local pcall = pcall -- capture pcall early before entrypoints wraps it
local type = type

local remote = remote and (type(remote)=="table" and rawget(remote,"__raw")) or remote

-- Trying to expand the refs table causes some problems, so just hide it...
local refsmeta = {
  __debugline = "<Debug Adapter Variable ID Cache [{table_size(self)}]>",
  __debugtype = "DebugAdapter.VariableRefs",
  __debugcontents = false,
}

local longrefsmeta = {
  __debugline = "<Debug Adapter Long-lived Variable ID Cache [{table_size(self)}]>",
  __debugtype = "DebugAdapter.VariableLongRefs",
  __debugcontents = false,
}

---@class DebugAdapter.Variables
local DAvars = {}

--- Debug Adapter variables module
---@class DAvarslib
local variables = {
  -- normal refs are cleared after every continue
  ---@type {[integer]:DAvarslib.Ref}
  refs = setmetatable({},refsmeta),
  -- long refs live forever, except objects that must not be kept for saving
  ---@type {[integer]:DAvarslib.Ref}
  longrefs = setmetatable({},longrefsmeta),
  -- objects to pass up to the parent __DebugAdapter
  __ = DAvars,
}

local gmeta = getmetatable(_ENV)
if not gmeta then
  gmeta = {}
  setmetatable(_ENV,gmeta)
end
---@type (DebugAdapter.RenderFilter|DebugAdapter.RenderOptionsWithFilter)[]
local env_opts={
  _G = "builtin", assert = "builtin", collectgarbage = "builtin", error = "builtin", getmetatable = "builtin",
  ipairs = "builtin", load = "builtin", loadstring = "builtin", next = "builtin", pairs = "builtin", pcall = "builtin",
  print = "builtin", rawequal = "builtin", rawlen = "builtin", rawget = "builtin", rawset = "builtin", select = "builtin",
  setmetatable = "builtin", tonumber = "builtin", tostring = "builtin", type = "builtin", xpcall = "builtin", _VERSION = "builtin",
  unpack = "builtin", table = "builtin", string = "builtin", bit32 = "builtin", math = "builtin", debug = "builtin", serpent = "builtin",
  package = "builtin", require = "builtin",

  remote = "factorio", commands = "factorio", settings = "factorio", rcon = "factorio", rendering = "factorio",
  script = "factorio", defines = "factorio", game = "factorio", global = "factorio", mods = "factorio", data = "factorio", util = "factorio",
  log = "factorio", table_size = "factorio", localised_print = "factorio",

  ["<Lua Builtin Globals>"] = {rawName=true, rawValue=true, virtual=true, ref=_ENV, extra="builtin"},
  ["<Factorio API>"] = {rawName=true, rawValue=true, virtual=true, ref=_ENV, extra="factorio"},
}

local env_sections = {
  ["<Lua Builtin Globals>"] = "<Lua Builtin Globals>",
  ["<Factorio API>"] = "<Factorio API>",
}

gmeta.__debugline = "<Global Self Reference>"
gmeta.__debugtype = "_ENV"
gmeta.__debugcontents = iterutil.sectioned_contents(env_sections,env_opts)

if __DebugAdapter.checkGlobals ~= false then
  local definedGlobals = {_=true}
  function DAvars.defineGlobal(name)
    definedGlobals[name] = true
  end

  local function ignore_global(k,info)
    if definedGlobals[k] then return true end
    if info.source:match("^@__core__") then return true end
    if info.source:match("^@__base__") then return true end
    return false
  end
  __DebugAdapter.stepIgnore(ignore_global)

  gmeta.__newindex = __DebugAdapter.stepIgnore(function(t,k,v)
    local info = debug.getinfo(2,"lS")
    if not ignore_global(k,info) then
      local body = {
        category = "console",
        output = "Assignment to undefined global: "..k.."="..variables.describe(v),
      }
      local istail = debug.getinfo(1,"t")
      if istail.istailcall then
        body.line = 1
        body.source = { name = "=(...tailcall...)" }
      else
        body.line = info.currentline
        local source = normalizeLuaSource(info.source)
        local dasource = {
          name = source,
          path = source,
        }
        if source == "=(dostring)" then
          local sourceref = variables.sourceRef(info.source)
          if sourceref then
            dasource = sourceref
          end
        end
        body.source = dasource
      end
      print("DBGprint: " .. json_encode(body))
    end
    rawset(t,k,v)
  end)
end

-- variable id refs
local nextID
do
  ---@type integer
  local nextRefID
  ---@type integer
  local nextEnd

  ---Called by VSCode to pass in a new block of refs
  ---@param ref any
  function DAvars.transferRef(ref)
    nextRefID = ref
    nextEnd = ref+65535
  end

  ---Get the next available ref
  ---@return integer
  function nextID()
    -- request from extension
    if nextRefID and nextRefID<nextEnd then
      local ref = nextRefID
      nextRefID = ref + 1
      return ref
    end
    print("DBG: getref")
    debug.debug(); -- call __DebugAdapter.transferRef(ref) and continue
    return nextRefID
  end
  __DebugAdapter.stepIgnore(nextID)
end

do
  ---@type fun(ls:LocalisedString)
  local localised_print = localised_print

  ---Translate a LocalisedString
  ---@param mesg LocalisedString
  ---@return integer|false @Translation ID or false if error
  ---@return string|nil @Error if any
  function variables.translate(mesg)
    local translationID = nextID()
    local success,result = pcall(localised_print, {"",
    "***DebugAdapterBlockPrint***\n"..
    "DBGtranslate: ", translationID, "\n",
    mesg,"\n"..
    "***EndDebugAdapterBlockPrint***"
    })
    if success then
      return translationID
    else
      return success,result
    end
  end

  --- Clear all references for short-lived things (scopes, stacks)
  function variables.clear()
    variables.refs = setmetatable({},refsmeta)
    local context = script and script.mod_name or "#data"
    localised_print{"","DBGuntranslate: ",context}
  end
end

---@class DAvarslib.Ref
---@field public type string

---@class DAvarslib.ScopeRef : DAvarslib.Ref
---@field type "Upvalues"|"Locals"
---@field frameId number
---@field mode "temps" | "varargs"

--- Generate a variablesReference for `name` at frame `frameId`
---@param frameId number
---@param name string = "Locals" | "Upvalues"
---@param mode? string = "temps" | "varargs"
---@return number variablesReference
---@overload fun(frameId:number, name:"Upvalues"):number
---@overload fun(frameId:number, name:"Locals", mode?:"temps"|"varargs"):number
function variables.scopeRef(frameId,name,mode)
  for id,varRef in pairs(variables.refs) do
    if varRef.type == name and ---@cast varRef DAvarslib.ScopeRef
      varRef.frameId == frameId and varRef.mode == mode then
      return id
    end
  end
  local id = nextID()
  variables.refs[id] = {
    type = name,
    frameId = frameId,
    mode = mode,
  }
  return id
end

---@class DAvarslib.KVRef : DAvarslib.Ref
---@field public type "kvPair"
---@field public name string
---@field public key Any
---@field public value Any

--- Generate a variablesReference for a key-value-pair for complex keys object
---@param key table
---@param value any
---@return number variablesReference
---@return string keyName
function variables.kvRef(key,value)
  local refs = variables.longrefs

  for id,varRef in pairs(refs) do
    if varRef.type == "kvPair" and ---@cast varRef DAvarslib.KVRef
      varRef.key == key and varRef.value == value then
      return id,varRef.name
    end
  end
  local id = nextID()
  local keytype = type(key)
  local name = "<"..keytype.." "..id..">"
  if keytype == "table" then
    name = "{<table "..variables.tableRef(key)..">}"
  elseif keytype == "function" then
    name = "<function "..variables.funcRef(key)..">"
  end


  refs[id] = {
    type = "kvPair",
    key = key,
    value = value,
    name = name,
  }
  return id,name
end

---@class DAvarslib.SourceRef : DAvarslib.Ref
---@field public type "Source"
---@field public source string

--- Generate a variablesReference for a source string and prepare a Source
---@param source string
---@param checkonly? boolean
---@return Source
function variables.sourceRef(source,checkonly)
  local refs = variables.longrefs

  for id,varRef in pairs(refs) do
    if varRef.type == "Source" and
      varRef--[[@as DAvarslib.SourceRef]].source == source then
      return {
        name = "=(dostring) "..id..".lua",
        sourceReference = id,
        origin = "dostring",
      }
    end
  end
  if checkonly then return end
  local id = nextID()
  refs[id] = {
    type = "Source",
    source = source,
  }
  return {
    name = "=(dostring) "..id..".lua",
    sourceReference = id,
    origin = "dostring",
  }
end

---@class DAvarslib.FuncRef : DAvarslib.Ref
---@field public type "Function"
---@field public func function

--- Generate a variablesReference for a function
---@param func function
---@return number variablesReference
function variables.funcRef(func)
  local refs = variables.longrefs

  for id,varRef in pairs(refs) do
    if varRef.type == "Function" and ---@cast varRef DAvarslib.FuncRef
      varRef.func == func then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Function",
    func = func,
  }
  return id
end

---@class DAvarslib.FetchRef : DAvarslib.Ref
---@field public type "Fetch"
---@field public func function

--- Generate a variablesReference for a fetchable property
---@param func function
---@return number variablesReference
function variables.fetchRef(func)
  local refs = variables.longrefs

  for id,varRef in pairs(refs) do
    if varRef.type == "Fetch" and ---@cast varRef DAvarslib.FetchRef
      varRef.func == func then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Fetch",
    func = func,
  }
  return id
end

---@class DAvarslib.TableRef : DAvarslib.Ref
---@field public type "Table"
---@field public table table
---@field public mode "pairs"|"ipairs"|"count"
---@field public showMeta boolean
---@field public extra any
---@field public evalName string

--- Generate a variablesReference for a table-like object
---@param table table
---@param mode? "pairs"|"ipairs"|"count"
---@param showMeta? boolean true
---@param extra? any
---@param evalName? string
---@return number variablesReference
function variables.tableRef(table, mode, showMeta, extra, evalName)
  mode = mode or "pairs"
  local refs = variables.longrefs
  for id,varRef in pairs(refs) do
    if varRef.type == "Table" and ---@cast varRef DAvarslib.TableRef
      varRef.table == table and varRef.mode == mode and
      varRef.showMeta == showMeta and varRef.extra == extra then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Table",
    table = table,
    mode = mode,
    showMeta = showMeta,
    extra = extra,
    evalName = evalName,
  }
  return id
end


---@class DAvarslib.LuaObjectRef : DAvarslib.Ref
---@field public type "LuaObject"
---@field public object LuaObject
---@field public classname string
---@field public evalName string

--- Generate a variablesReference for a LuaObject
---@param luaObject LuaObject
---@param classname string
---@param evalName? string
---@return number variablesReference
function variables.luaObjectRef(luaObject,classname,evalName)
  if not luaObjectInfo.expandKeys[classname] then return 0 end
  local refs = variables.longrefs
  for id,varRef in pairs(refs) do
    if varRef.type == "LuaObject" and ---@cast varRef DAvarslib.LuaObjectRef
      varRef.object == luaObject then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "LuaObject",
    object = luaObject,
    classname = classname,
    evalName = evalName
  }
  return id
end


---@param classname string
---@param object LuaObject
---@param short? boolean
---@return string
---@return any
local function describeLuaObject(classname,object,short)
  ---@type string
  local lineitem
  if classname == "LuaCustomTable" then
      lineitem = ("%d item%s"):format(#object, #object~=1 and "s" or "" )
  else
    if luaObjectInfo.alwaysValid[classname:match("^([^.]+)%.?")] or object.valid then
      local lineitemfmt = luaObjectInfo.lineItem[classname]
      lineitem = ("<%s>"):format(classname)
      local litype = type(lineitemfmt)
      if litype == "function" then
        -- don't crash a debug session for a bad formatter...
        local success,result = pcall(lineitemfmt,object,short)
        if success then lineitem = result end
      elseif litype == "string" and not short then
        lineitem = __DebugAdapter.stringInterp(lineitemfmt,nil,object,"luaobjectline")
      end
    else
      lineitem = ("<Invalid %s>"):format(classname)
    end
  end
  return lineitem,classname
end

--- Generates a description for `value`.
--- Also returns data type as second return.
---@param value any
---@param short nil | boolean
---@return string lineitem
---@return string datatype
function variables.describe(value,short)
  ---@type string
  local lineitem
  local vtype = type(value)
  if vtype == "table" then
    local classname = luaObjectInfo.try_object_name(value)
    if classname then
      lineitem,vtype = describeLuaObject(classname,value,short)
    else -- non-LuaObject tables
      local mt = debug.getmetatable(value)
      if mt and mt.__debugline then -- it knows how to make a line for itself...
        ---@type string|fun(value:table,short?:boolean)
        local debugline = mt.__debugline
        local dltype = type(debugline)
        if dltype == "function" then
          -- don't crash a debug session for a bad user-provided formatter...
          local success,result = pcall(debugline,value,short)
          if success then
            lineitem = result
          else
            lineitem = "<__debugline error>"
          end
        elseif dltype == "string" and not short then
          lineitem = __DebugAdapter.stringInterp(debugline,nil,value,"metadebugline")
        else
          lineitem = "{<...>}"
        end
      else
        --TODO: recognize Concept types? LocalisedString specifically?
        if short then
          if next(value) or mt then
            -- this table has contents or other nontrivial behavior
            lineitem = "{<...>}"
          else
            -- this is an empty table!
            lineitem = "{}"
          end
        else
          -- generate { [shortdescribe(key)]=shortdescribe(value), ... }
          -- but omit consecutive numeric indexes { shortdescribe(value), ... }
          local inext = 1
          if next(value) then
            ---@type string[]
            local innerpairs = { "{ " }
            for k,v in pairs(value) do
              if k == inext then
                innerpairs[#innerpairs + 1] = ([[%s, ]]):format((variables.describe(v,true)))
                inext = inext + 1
              else
                inext = nil
                if type(k) == "string" and k:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
                  innerpairs[#innerpairs + 1] = ([[%s=%s, ]]):format(
                    k, (variables.describe(v,true)))
                else
                  innerpairs[#innerpairs + 1] = ([[[%s]=%s, ]]):format(
                    (variables.describe(k,true)), (variables.describe(v,true)))
                end

              end
            end
            innerpairs[#innerpairs + 1] = "}"
            lineitem = table.concat(innerpairs)
          else
            -- this is an empty table!
            lineitem = "{}"
          end
        end
      end
    end
  elseif vtype == "function" then
    local info = debug.getinfo(value, "nS")
    lineitem = "<function>"
    if not short then
      if info.what == "C" then
        lineitem = "<C function>"
      elseif info.what == "Lua" then
        lineitem = ("<Lua function %s:%d>"):format(info.source and normalizeLuaSource(info.source),info.linedefined)
      elseif info.what == "main" then
        lineitem = ("<main chunk %s>"):format(info.source and normalizeLuaSource(info.source))
      end
    end
  elseif vtype == "userdata" then
    local classname = luaObjectInfo.try_object_name(value)
    if classname then
      lineitem,vtype = describeLuaObject(classname,value,short)
    else -- non LuaObject userdata?!?!
      lineitem = "<userdata>"
    end
  elseif vtype == "string" then
    lineitem = ("%q"):format(value)
  else -- boolean, number, nil
    lineitem = tostring(value)
  end
  return lineitem,vtype
end
DAvars.describe = variables.describe

--- Generate a default debug view for `value` named `name`
---@param name string | nil
---@param value any
---@param evalName string | nil
---@return Variable
function variables.create(name,value,evalName)
  local lineitem,vtype = variables.describe(value)
  local variablesReference = 0
  ---@type number|nil
  local namedVariables
  ---@type number|nil
  local indexedVariables
  if vtype == "LuaCustomTable" then
    variablesReference = variables.tableRef(value,"pairs",false)
    -- get the "first" one to see which kind of index they are
    -- some LuaCustomTable use integer keys, some use string keys.
    -- some allow mixed for lookup, but the iterator gives ints for those.
    local k,v = pairs(value)(value,nil)
    if k == 1 then
      indexedVariables = #value + 1 --vscode assumes indexes start at 0, so pad one extra
    else
      namedVariables = #value
    end
  elseif vtype:sub(1,3) == "Lua" then
    variablesReference = variables.luaObjectRef(value,vtype,evalName)
  elseif vtype == "table" then
    local mt = debug.getmetatable(value)
    if not mt or mt.__debugcontents == nil then
      variablesReference = variables.tableRef(value,nil,nil,nil,evalName)
      namedVariables = 0
      indexedVariables = rawlen(value)
      local namesStartAfter = indexedVariables
      if namesStartAfter == 0 then
        namesStartAfter = nil
      else
        indexedVariables = indexedVariables + 1 --vscode assumes indexes start at 0, so pad one extra
      end
      for k,v in next,value,namesStartAfter do
        namedVariables = namedVariables + 1
      end
      if not mt and namedVariables == 0 and type(value[1]) == "string" then
        -- no meta, array-like, and starts with a string, maybe a localisedstring? at least try...
        namedVariables = 1
      end
    elseif mt.__debugcontents then -- mt and ...
      variablesReference = variables.tableRef(value)
    end
    if mt and type(mt.__debugtype) == "string" then
      vtype = mt.__debugtype
    end
  elseif vtype == "function" then
    variablesReference = variables.funcRef(value)
  end
  return {
    name = name,
    value = lineitem,
    type = vtype,
    variablesReference = variablesReference,
    indexedVariables = indexedVariables,
    namedVariables = namedVariables,
    evaluateName = evalName,
  }
end

function variables.error(message)
  return setmetatable({},{
    __debugline = message,
    __debugtype = "error",
    __debugcontents = false,
  })
end

local itermode = {
  pairs = pairs,
  ipairs = ipairs,
}

---@alias DebugAdapter.DebugContents<K,V,E> fun(self:table,extra:E):DebugAdapter.DebugNext<K,V,E>,any,any
---@alias DebugAdapter.DebugNext<K,V> fun(t:any,k:K):K,V,DebugAdapter.RenderOptions

---@class DebugAdapter.RenderOptions
---@field rawName? boolean @ if `k` is a string, display it as-is
---@field rawValue? boolean @ if `v` is a string, display it as-is
---@field virtual? boolean
---@field ref? table|function @ Object to expand children of instead of this value
---@field fetchable? boolean @ if ref or value is function, treat as fetchable property instead of raw function
---@field extra? any @ Extra object to pass back to `__debugcontents`

--- DebugAdapter VariablesRequest
---@param variablesReference integer
---@param seq number
---@param filter nil | 'indexed' | 'named'
---@param start nil | number
---@param count nil | number
---@param longonly nil | boolean
---@return Variable[]
function DAvars.variables(variablesReference,seq,filter,start,count,longonly)
  ---@type DAvarslib.Ref
  local varRef
  if longonly then
    varRef = variables.longrefs[variablesReference]
  else
    varRef = variables.refs[variablesReference] or variables.longrefs[variablesReference]
    -- or remote lookup to find a long ref in another lua...
    if not varRef and __DebugAdapter.canRemoteCall() then
      local call = remote.call
      for remotename,_ in pairs(remote.interfaces) do
        local modname = remotename:match("^__debugadapter_(.+)$")
        if modname then
          if call(remotename,"longVariables",variablesReference,seq,filter,start,count,true) then
            return true
          end
        end
      end
    end
  end
  ---@type Variable[]
  local vars = {}
  if varRef then
    if varRef.type == "Locals" then
      ---@type DAvarslib.ScopeRef
      local varRef = varRef
      local mode = varRef.mode
      local hasTemps =  false
      local i = 1

      if mode == "varargs" then
        i = -1
        while true do
          local name,value = debug.getlocal(varRef.frameId,i)
          if not name then break end
          vars[#vars + 1] = variables.create(("(*vararg %d)"):format(-i),value)
          i = i - 1
        end
      else
        ---@type {[string]:{index:number, reg:number}}
        local shadow = {}
        while true do
          local name,value = debug.getlocal(varRef.frameId,i)
          if not name then break end
          local isTemp = name:sub(1,1) == "("
          if isTemp then hasTemps = true end
          if (mode == "temps" and isTemp) or (not mode and not isTemp) then
            ---@type string
            local evalName
            if isTemp then
              name = ("%s %d)"):format(name:sub(1,-2),i)
            else
              evalName = name
            end
            local j = #vars + 1
            local lastshadow = shadow[name]
            if lastshadow then
              local var = vars[lastshadow.index]
              var.name = var.name.."@"..lastshadow.reg
              if var.evaluateName then var.evaluateName = nil end
            end
            vars[j] = variables.create(name,value,evalName)
            shadow[name] = {index = j, reg = i}
          end
          i = i + 1
        end
        if not mode then
          if hasTemps then
            table.insert(vars,1,{
              name = "<temporaries>", value = "<temporaries>",
              variablesReference = variables.scopeRef(varRef.frameId,"Locals","temps"),
              presentationHint = {kind="virtual"},
            })
          end
          local info = debug.getinfo(varRef.frameId,"u")
          if info.isvararg then
            local varargidx = info.nparams + 1
            if hasTemps then varargidx = varargidx + 1 end
            table.insert(vars,varargidx,{
              name = "<varargs>", value = "<varargs>",
              variablesReference = variables.scopeRef(varRef.frameId,"Locals","varargs"),
              presentationHint = {kind="virtual"},
            })
          end
        end
      end
    elseif varRef.type == "Upvalues" then
      ---@type DAvarslib.ScopeRef
      local varRef = varRef
      local func = debug.getinfo(varRef.frameId,"f").func
      local i = 1
      while true do
        local name,value = debug.getupvalue(func,i)
        if not name then break end
        vars[#vars + 1] = variables.create(name,value,name)
        i = i + 1
      end
    elseif varRef.type == "Table" then
      ---@type DAvarslib.TableRef
      local varRef = varRef
      -- use debug.getmetatable insead of getmetatable to get raw meta instead of __metatable result
      local mt = debug.getmetatable(varRef.table)
      if varRef.mode == "count" then
        --don't show meta on these by default as they're mostly LuaObjects providing count iteration anyway
        if varRef.showMeta == true and mt then
          ---@type string
          local evalName
          if varRef.evalName then
            evalName = "debug.getmetatable(" .. varRef.evalName .. ")"
          end
          vars[#vars + 1]{
            name = "<metatable>",
            value = "metatable",
            type = "metatable",
            variablesReference = variables.tableRef(mt),
            evaluateName = evalName,
            presentationHint = {kind="virtual"},
          }
        end
        local stop = #varRef.table
        if filter == "indexed" then
          if not start or start == 0 then
            start = 1
            count = count - 1
          end
          local wouldstop = start + (count - 1)
          if wouldstop < stop then
            stop = wouldstop
          end
        else
          start = 1
        end
        for i=start,stop do
          ---@type string
          local evalName
          if varRef.evalName then
            evalName = varRef.evalName .. "[" .. tostring(i) .. "]"
          end
          vars[#vars + 1] = variables.create(tostring(i),varRef.table[i], evalName)
        end
      else
        if mt and type(mt.__debugcontents) == "function" then
          ---@type DebugAdapter.DebugContents<any,any,any>
          local __debugcontents = mt.__debugcontents
          local success, __debugnext, t, firstk = pcall(__debugcontents,varRef.table,varRef.extra)
          if success then
            ---@cast __debugnext DebugAdapter.DebugNext<any,any>
            while true do
              local success,k,v,opts = pcall(__debugnext,t,firstk)
              if not success then
                vars[#vars + 1] = {
                    name = "<__debugnext error>",
                    -- describe in case it's a LocalisedString or other non-string error object
                    value = variables.describe(k),
                    type = "error",
                    variablesReference = 0,
                    presentationHint = {kind="virtual"},
                  }
                  break
              end
              ---@cast opts DebugAdapter.RenderOptions|nil
              if not k then
                break
              end
              local kline,ktype = variables.describe(k,true)
              local newvar = variables.create(kline,v)
              if ktype == "string" and opts and opts.rawName then
                newvar.name = k
              elseif ktype == "table" or ktype == "function" then
                newvar.variablesReference,newvar.name = variables.kvRef(k,v)
              end
              if type(v)=="string" and opts and opts.rawValue then
                newvar.value = v
                newvar.type = nil
              end
              if opts and opts.ref then
                  local ref = opts.ref
                  local tref = type(ref)
                  if tref == "table" then
                    newvar.variablesReference = variables.tableRef(ref,nil,nil,opts.extra)
                  elseif tref == "function" then
                    if opts.fetchable then
                      newvar.variablesReference = variables.fetchRef(ref)
                      newvar.presentationHint = newvar.presentationHint or {}
                      newvar.presentationHint.lazy = true
                    else
                      newvar.variablesReference = variables.funcRef(ref)
                    end
                  end

              elseif type(v) == "table" and opts and opts.extra then
                newvar.variablesReference = variables.tableRef(v,nil,nil,opts.extra)
              end
              if opts and opts.virtual then
                newvar.presentationHint = newvar.presentationHint or {}
                newvar.presentationHint.kind="virtual"
              end
              vars[#vars + 1] = newvar
              firstk = k
            end
          else
            vars[#vars + 1] = {
              name = "<__debugcontents error>",
              -- describe in case it's a LocalisedString or other non-string error object
              value = variables.describe(__debugnext),
              type = "error",
              variablesReference = 0,
              presentationHint = {kind="virtual"},
            }
          end
        else
          -- show metatables by default for table-like objects
          if varRef.showMeta ~= false and mt then
            ---@type string
            local evalName
            if varRef.evalName then
              evalName = "debug.getmetatable(" .. varRef.evalName .. ")"
            end
            vars[#vars + 1] = {
              name = "<metatable>",
              value = "metatable",
              type = "metatable",
              variablesReference = variables.tableRef(mt),
              evaluateName = evalName,
              presentationHint = {kind="virtual"},
            }
          end

          -- rough heuristic for matching LocalisedStrings
          -- tables with no meta, and [1] that is string
          if filter == "named" and not mt and type(varRef.table[1]) == "string" then
            -- print a translation for this with unique id
            local i,mesg = variables.translate(varRef.table)
            vars[#vars + 1] = {
              name = "<translated>",
              value = i and ("{LocalisedString "..i.."}") or ("<"..mesg..">"),
              type = "LocalisedString",
              variablesReference = 0,
              presentationHint = { kind = "virtual", attributes = { "readOnly" } },
            }
          end

          ---@alias nextfn fun(t:table,k:any):any,any
          ---@type fun(t:table):nextfn,table,any
          local debugpairs = itermode[varRef.mode]
          if debugpairs then
            local success,f,t,firstk = pcall(debugpairs,varRef.table)
            if success then
              ---@type fun(t:table):number
              local len = mt and mt.__len
              if len then
                if not luaObjectInfo.try_object_name(varRef.table) then
                  len = rawlen
                end
              else
                len = rawlen
              end
              local maxindex = len(varRef.table)
              if filter == "indexed" then
                if not start or start == 0 then
                  start = 1
                  count = count and (count - 1)
                end
                firstk = start - 1
                if firstk == 0 then firstk = nil end
              elseif filter == "named" then
                if maxindex > 0 then
                  firstk = maxindex
                end
                -- skip ahead some names? limit them? vscode does not currently ask for limited names
              end
              local limit = (filter == "indexed") and (start+count)
              while true do
                local success,k,v = pcall(f,t,firstk)
                if not success then
                  vars[#vars + 1] = {
                    name = "<"..varRef.mode.." error>",
                    value = variables.describe(k),
                    type = "error",
                    variablesReference = 0,
                    presentationHint = {kind="virtual"},
                  }
                  break
                end
                if not k then
                  break
                end
                if filter == "indexed" and ((type(k) ~= "number") or (k > maxindex) or (k >= limit) or (k == 0) or (k % 1 ~= 0)) then
                  break
                end
                ---@type string
                local evalName
                if varRef.evalName then
                  evalName = varRef.evalName .. "[" .. variables.describe(k,true) .. "]"
                end
                local kline,ktype = variables.describe(k,true)
                local newvar = variables.create(kline,v, evalName)
                if ktype == "table" or ktype == "function" then
                  newvar.variablesReference,newvar.name = variables.kvRef(k,v)
                end
                vars[#vars + 1] = newvar
                if count then
                  count = count - 1
                  if count == 0 then break end
                end
                firstk = k
              end
            else
              vars[#vars + 1] = {
                name = "<"..varRef.mode.." error>",
                value = variables.describe(f),
                type = "error",
                variablesReference = 0,
                presentationHint = {kind="virtual"},
              }
            end
          else
            vars[#vars + 1] = {
              name = "<table varRef error>",
              value = "missing iterator for table varRef mode ".. varRef.mode,
              type = "error",
              variablesReference = 0,
              presentationHint = {kind="virtual"},
            }
          end
        end
      end
    elseif varRef.type == "LuaObject" then
      ---@type DAvarslib.LuaObjectRef
      local varRef = varRef
      local object = varRef.object
      if luaObjectInfo.alwaysValid[varRef.classname:match("^([^.]+).?")] or object.valid then
        if varRef.classname == "LuaItemStack" and --[[@cast object LuaItemStack]]
          not object.valid_for_read then
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
                value = ("%d item%s"):format(#object, #object~=1 and "s" or ""),
                type = varRef.classname .. "[]",
                variablesReference = variables.tableRef(object, keyprops.iterMode, false,nil,varRef.evalName),
                indexedVariables = #object + 1,
                presentationHint = { kind = "virtual", attributes = { "readOnly" } },
              }
            elseif keyprops.thisTranslated then
              ---@type string
              local value
              do
                -- print a translation for this with unique id
                local id,mesg = variables.translate(object)
                if id then
                  value = "{LocalisedString "..id.."}"
                else
                  value = "<"..mesg..">"
                end
              end
              vars[#vars + 1] = {
                name = "<translated>",
                value = value,
                type = "LocalisedString",
                variablesReference = 0,
                presentationHint = { kind = "virtual", attributes = { "readOnly" } },
              }
            else
              -- Not all keys are valid on all LuaObjects of a given type. Just skip the errors (or nils)
              local success,value = pcall(function() return object[key] end)
              if success and value ~= nil then
                ---@type string
                local evalName
                if varRef.evalName then
                  evalName = varRef.evalName .. "[" .. variables.describe(key,true) .. "]"
                end
                local var = variables.create(variables.describe(key,true),value,evalName)

                local enum = keyprops.enum
                local tenum = type(enum)
                if tenum == "table" then
                  local name = enum[value]
                  if name then
                    var.value = name
                  end
                elseif tenum == "function" then
                  local success,name = pcall(enum,object,value)
                  if success and name then
                    var.value = name
                  end
                end

                var.presentationHint = var.presentationHint or {}
                var.presentationHint.kind = "property"
                if keyprops.readOnly then
                  var.presentationHint.attributes = var.presentationHint.attributes or {}
                  var.presentationHint.attributes[#var.presentationHint.attributes + 1] = "readOnly"
                end
                if keyprops.fetchable then
                  var.name = key.."()"
                  var.presentationHint.kind = "method"
                  var.presentationHint.lazy = true
                  var.variablesReference = variables.fetchRef(value)
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
    elseif varRef.type == "kvPair" then
      ---@type DAvarslib.KVRef
      local varRef = varRef
      vars[#vars + 1] = variables.create("<key>",varRef.key)
      vars[#vars + 1] = variables.create("<value>",varRef.value)
    elseif varRef.type == "Function" then
      ---@type DAvarslib.FuncRef
      local varRef = varRef
      local func = varRef.func
      local i = 1
      while true do
        local name,value = debug.getupvalue(func,i)
        if not name then break end
        if name == "" then name = "<"..i..">" end
        vars[#vars + 1] = variables.create(name,value,name)
        i = i + 1
      end
    elseif varRef.type == "Fetch" then
      ---@type DAvarslib.FetchRef
      local varRef = varRef
      local func = varRef.func
      local success,result = pcall(func)
      if success then
        vars[#vars + 1] = variables.create("<Fetch Result>",result)
      else
        vars[#vars + 1] = {
          name = "<Fetch error>",
          -- describe in case it's a LocalisedString or other non-string error object
          value = variables.describe(result),
          type = "error",
          variablesReference = 0,
          presentationHint = { kind="virtual"},
        }
      end
    end
    if #vars == 0 then
      vars[1] = {
        name = "<empty>",
        value = "empty",
        type = "empty",
        variablesReference = 0,
        presentationHint = { kind = "virtual", attributes = { "readOnly" } },
      }
    end
  elseif not longonly then
    vars[1] = {
      name= "Expired variablesReference",
      value= "Expired variablesReference ref="..variablesReference.." seq="..seq,
      variablesReference= 0,
      presentationHint = {kind="virtual"},
    }
  end

  if varRef or (not longonly) then
    print("DBGvars: " .. json_encode({variablesReference = variablesReference, seq = seq, vars = vars, long = longonly and script.mod_name}))
    return true
  end
end

--- DebugAdapter SetVariablesRequest
---@param variablesReference integer
---@param name string
---@param value string
---@param seq number
function DAvars.setVariable(variablesReference, name, value, seq)
  local varRef = variables.refs[variablesReference]
  if varRef then
    if varRef.type == "Locals" then
      ---@type DAvarslib.ScopeRef
      local varRef = varRef
      if varRef.mode ~= "varargs" then
        local i = 1
        local localindex
        local matchname,matchidx = name:match("^([_%a][_%w]*)@(%d+)$")
        if matchname then
          local lname = debug.getlocal(varRef.frameId,matchidx)
          if lname == matchname then
            localindex = matchidx
          else
            print("DBGsetvar: " .. json_encode({seq = seq, body = {
              type="error",
              value="name mismatch at register "..matchidx.." expected `"..matchname.."` got `"..lname.."`"
            }}))
            return
          end
        else
          while true do
            local lname = debug.getlocal(varRef.frameId,i)
            if not lname then break end
            if lname:sub(1,1) == "(" then
              lname = ("%s %d)"):format(lname:sub(1,-2),i)
            end
            if lname == name then
              localindex = i
            end
            i = i + 1
          end
        end
        if localindex then
          local goodvalue,newvalue = __DebugAdapter.evaluateInternal(varRef.frameId+1,nil,"setvar",value)
          if goodvalue then
            debug.setlocal(varRef.frameId,localindex,newvalue)
            print("DBGsetvar: " .. json_encode({seq = seq, body = variables.create(nil,newvalue)}))
            return
          else
            print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value=newvalue}}))
            return
          end
        else
          print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value="named var not present"}}))
          return
        end
      else
        local i = -1
        while true do
          local vaname = debug.getlocal(varRef.frameId,i)
          if not vaname then break end
          vaname = ("(*vararg %d)"):format(-i)
          if vaname == name then
            local goodvalue,newvalue = __DebugAdapter.evaluateInternal(varRef.frameId+1,nil,"setvar",value)
            if goodvalue then
              debug.setlocal(varRef.frameId,i,newvalue)
              print("DBGsetvar: " .. json_encode({seq = seq, body = variables.create(nil,newvalue)}))
              return
            else
              print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value=newvalue}}))
              return
            end
          end
          i = i - 1
        end
      end
      print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value="invalid local name"}}))
      return
    elseif varRef.type == "Upvalues" then
      ---@type DAvarslib.ScopeRef
      local varRef = varRef
      local func = debug.getinfo(varRef.frameId,"f").func
      local i = 1
      while true do
        local upname = debug.getupvalue(func,i)
        if not upname then break end
        if upname == name then
          local goodvalue,newvalue = __DebugAdapter.evaluateInternal(varRef.frameId+1,nil,"setvar",value)
          if goodvalue then
            debug.setupvalue(func,i,newvalue)
            print("DBGsetvar: " .. json_encode({seq = seq, body = variables.create(nil,newvalue)}))
            return
          else
            print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value=newvalue}}))
            return
          end
        end
        i = i + 1
      end
      print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value="invalid upval name"}}))
      return
    elseif varRef.type == "Table" or varRef.type == "LuaObject" then
      -- special names "[]" and others aren't valid lua so it won't parse anyway
      local goodname,newname = __DebugAdapter.evaluateInternal(nil,nil,"setvar",name)
      if goodname then
        local alsoLookIn ---@type table|LuaObject
        if varRef.type == "Table" then
          ---@cast varRef DAvarslib.TableRef
          alsoLookIn = varRef.table
        elseif varRef.type == "LuaObject" then
          ---@cast varRef DAvarslib.LuaObjectRef
          alsoLookIn = varRef.object
        end
        local goodvalue,newvalue = __DebugAdapter.evaluateInternal(nil,alsoLookIn,"setvar",value)
        if not goodvalue then
          print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value=newvalue}}))
          return
        end
        -- this could fail if table has __newindex or LuaObject property is read only or wrong type, etc
        local goodassign,mesg = pcall(function() alsoLookIn[newname] = newvalue end)
        if not goodassign then
          print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value=mesg}}))
          return
        end

        -- it could even fail silently, or coerce the value to another type,
        -- so fetch the value back instead of assuming it set...
        -- also, refresh the value even if we didn't update it
        local _,resultvalue = pcall(function() return alsoLookIn[newname] end)
        print("DBGsetvar: " .. json_encode({seq = seq, body = variables.create(nil,resultvalue)}))
        return
      else
        print("DBGsetvar: " .. json_encode({seq = seq, body = {type="error",value="invalid property name"}}))
        return
      end
    end
  end
end

if data then
  -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
  local reg = debug.getregistry()
  reg.__DAVariables = variables
end
return __DebugAdapter.stepIgnore(variables)