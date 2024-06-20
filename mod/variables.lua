local require = require
-- force canonical name require to ensure only one instance of `refs`, `collectables`
if ... ~= "__debugadapter__/variables.lua" then
  return require("__debugadapter__/variables.lua")
end


local debug = debug
local dgetregistry = debug.getregistry
if data then
  -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
  local reg = dgetregistry()
  ---@type DAvarslib
  local regvars = reg.__DAVariables
  if regvars then return regvars end
end

local dispatch = require("__debugadapter__/dispatch.lua")
local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require("__debugadapter__/json.lua")
local iterutil = require("__debugadapter__/iterutil.lua")

local dgetmetatable = debug.getmetatable
local dgetinfo = debug.getinfo
local dgetlocal = debug.getlocal
local dsetlocal = debug.setlocal
local dgetupvalue = debug.getupvalue
local dsetupvalue = debug.setupvalue
local debugprompt = debug.debug
local string = string
local ssub = string.sub
local sformat = string.format
local smatch = string.match
local schar = string.char
local sgsub = string.gsub
local table = table
local tinsert = table.insert
local tconcat = table.concat
local tostring = tostring
local setmetatable = setmetatable
local getmetatable = getmetatable
local rawlen = rawlen
local next = next
local pairs = pairs
local ipairs = ipairs
local print = print
local pcall = pcall
local type = type
local assert = assert

local env = _ENV
local _ENV = nil

local function stringInterp(...)
  stringInterp = assert(dispatch.bind("stringInterp"))
  return stringInterp(...)
end

local function evaluateInternal(...)
  evaluateInternal = assert(dispatch.bind("evaluateInternal"))
  return evaluateInternal(...)
end

---@type {[integer]:DAvarslib.Ref}
local refs = setmetatable({},{
  __debugline = "<Debug Adapter Variable ID Cache [{table_size(self)}]>",
  __debugtype = "DebugAdapter.VariableRefs",
  __debugcontents = false,
})

---@type {[integer|string]:DAvarslib.SourceRef}
local sourcerefs = setmetatable({},{
  __debugline = "<Debug Adapter Source ID Cache [{table_size(self)}]>",
  __debugtype = "DebugAdapter.SourceRefs",
  __debugcontents = false,
})

local collectable
do
  local collectables = setmetatable({},{
    __mode = 'v'
  })

  ---@type metatable
  local colmeta = {
    __gc = function(self)
      for k in pairs(self) do
        refs[k] = nil
      end
    end,
  }

  ---@type metatable
  local wrapmeta = {
    __debugtype = "DebugAdapter.Collectable",
    __mode = "v",
    __call = function(self)
      return collectables[self.__weak]
    end,
  }

  ---@alias DAvarslib.Collectable<T> fun():T

  local plain = {
    ["nil"]=true,
    ["string"]=true,
    ["boolean"]=true,
    ["number"]=true,
  }

  ---create a new collectable ref to `obj` for varref `id`, or add `id` to an existing one
  ---@generic T
  ---@param obj T
  ---@param id integer
  ---@return DAvarslib.Collectable<T?>
  function collectable(obj, id)
    local tobj = type(obj)
    -- for non-collectable values, just box them (possibly the value in kvPair)
    if plain[tobj] then
      return function() return obj end
    end
    for k,v in pairs(collectables) do
      if v == obj then
        k[id] = true
        return setmetatable({__weak=k}, wrapmeta) --[[@as DAvarslib.Collectable]]
      end
    end
    local k = setmetatable({[id]=true}, colmeta)
    collectables[k] = obj
    return setmetatable({__weak=k}, wrapmeta) --[[@as DAvarslib.Collectable]]
  end
end

---@class DebugAdapter.Variables
local DAvars = {}

--- Debug Adapter variables module
---@class DAvarslib
local variables = {
  -- objects to pass up to the parent __DebugAdapter
  __dap = DAvars,
}
local pindex,pnewindex
do
  local function index(t,k) return t[k] end
  local function newindex(t,k,v) t[k]=v end

  ---@param t any
  ---@param k any
  ---@return boolean success
  ---@return any value
  function pindex(t,k) return pcall(index,t,k) end

  ---@param t any
  ---@param k any
  ---@param v any
  ---@return boolean success
  function pnewindex(t,k,v) return pcall(newindex,t,k,v) end
end
variables.pindex = pindex
variables.pnewindex = pnewindex

local gmeta = getmetatable(env) --[[@as metatable_debug]]
if not gmeta then
  gmeta = {}
  setmetatable(env,gmeta)
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

  ["<Lua Builtin Globals>"] = {rawName=true, rawValue=true, virtual=true, ref=env, extra="builtin"},
  ["<Factorio API>"] = {rawName=true, rawValue=true, virtual=true, ref=env, extra="factorio"},
}

local env_sections = {
  ["<Lua Builtin Globals>"] = "<Lua Builtin Globals>",
  ["<Factorio API>"] = "<Factorio API>",
}

gmeta.__debugline = "<Global Self Reference>"
gmeta.__debugtype = "_ENV"
gmeta.__debugcontents = iterutil.sectioned_contents(env_sections,env_opts)

-- variable id refs
local nextID
do
  ---@type integer
  local nextRefID
  ---@type integer
  local nextEnd

  ---Called by VSCode to pass in a new block of refs
  ---@param ref any
  ---@private
  function DAvars.transferRef(ref)
    nextRefID = ref
    nextEnd = ref+4095
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
    print("\xEF\xB7\x90\xEE\x80\x85")
    debugprompt(); -- call __DebugAdapter.transferRef(ref) and continue
    return nextRefID
  end
end

do
  local localised_print = env.localised_print

  ---Translate a LocalisedString
  ---@param mesg LocalisedString
  ---@return string|false @Translation ID or false if error
  ---@return string|nil @Error if any
  function variables.translate(mesg)
    local translationID = nextID()
    local success,result = pcall(localised_print, {"",
    "\xEF\xB7\xAE\xEF\xB7\x94", translationID, "\x01",
    mesg,"\xEF\xB7\xAF"
    })
    if success then
      return "\xEF\xB7\x94"..translationID
    else
      return success,result
    end
  end
end

do
  local escape_char_map = {
    ["\xEF"] = "\xEF\xA3\xAF"
  }

  for i = 0, 0x1f, 1 do
    local c = schar(i)
    if not escape_char_map[c] then
      escape_char_map[c] = "\xEF\xA0"..schar(i+0x80)
    end
  end

  ---Pass a string to vscode as a raw buffer
  ---@param buff string
  ---@return string @Buffer ID for reviver
  function variables.buffer(buff)
    local bufferID = nextID()
    print("\xEF\xB7\xAE\xEF\xB7\x97"..bufferID.."\x01"..sgsub(buff, '[\n\xEF"]', escape_char_map).."\xEF\xB7\xAF")
    return "\xEF\xB7\x95"..bufferID
  end
end

---@class DAvarslib.Ref
---@field public type string

---@class DAvarslib.ScopeRef : DAvarslib.Ref
---@field type "Upvalues"|"Locals"
---@field frameId integer
---@field mode "temps" | "varargs"

--- Generate a variablesReference for `name` at frame `frameId`
---@param frameId integer
---@param name "Locals" | "Upvalues"
---@param mode? "temps" | "varargs"
---@return integer variablesReference
---@overload fun(frameId:integer, name:"Upvalues"):integer
---@overload fun(frameId:integer, name:"Locals", mode?:"temps"|"varargs"):integer
function variables.scopeRef(frameId,name,mode)
  for id,varRef in pairs(refs) do
    if varRef.type == name and ---@cast varRef DAvarslib.ScopeRef
      varRef.frameId == frameId and varRef.mode == mode then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = name,
    frameId = frameId,
    mode = mode,
  }
  return id
end

---@class DAvarslib.KVRef : DAvarslib.Ref
---@field public type "kvPair"
---@field public name string
---@field public key DAvarslib.Collectable<Any>
---@field public value DAvarslib.Collectable<Any>

--- Generate a variablesReference for a key-value-pair for complex keys object
---@param key table|function
---@param value any
---@return integer variablesReference
---@return string keyName
function variables.kvRef(key,value)
  for id,varRef in pairs(refs) do
    if varRef.type == "kvPair" and ---@cast varRef DAvarslib.KVRef
      varRef.key() == key and varRef.value() == value then
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
    key = collectable(key, id),
    value = collectable(value, id),
    name = name,
  }
  return id,name
end

---@class DAvarslib.SourceRef
---@field public type "Source"
---@field public id integer
---@field public source string

--- Generate a variablesReference for a source string and prepare a Source
---@param source string
---@param checkonly? boolean
---@return DebugProtocol.Source?
---@overload fun(source:string):DebugProtocol.Source
---@overload fun(source:string, checkonly:false):DebugProtocol.Source
---@overload fun(source:string, checkonly:true):DebugProtocol.Source?
function variables.sourceRef(source,checkonly)
  local sref = sourcerefs[source]
  if sref then
    local id = sref.id
    return {
      name = "=(dostring) "..id..".lua",
      sourceReference = id,
      origin = "dostring",
    }
  end
  if checkonly then return end
  local id = nextID()
  sref = {
    type = "Source",
    source = source,
    id = id,
  }
  sourcerefs[id] = sref
  sourcerefs[source] = sref
  return {
    name = "=(dostring) "..id..".lua",
    sourceReference = id,
    origin = "dostring",
  }
end

---@class DAvarslib.FuncRef : DAvarslib.Ref
---@field public type "Function"
---@field public func DAvarslib.Collectable<function>

--- Generate a variablesReference for a function
---@param func function
---@return integer variablesReference
function variables.funcRef(func)
  for id,varRef in pairs(refs) do
    if varRef.type == "Function" and ---@cast varRef DAvarslib.FuncRef
      varRef.func() == func then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Function",
    func = collectable(func, id),
  }
  return id
end

---@class DAvarslib.FetchRef : DAvarslib.Ref
---@field public type "Fetch"
---@field public func DAvarslib.Collectable<function>

--- Generate a variablesReference for a fetchable property
---@param func function
---@return integer variablesReference
function variables.fetchRef(func)
  for id,varRef in pairs(refs) do
    if varRef.type == "Fetch" and ---@cast varRef DAvarslib.FetchRef
      varRef.func() == func then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Fetch",
    func = collectable(func, id),
  }
  return id
end

---@class DAvarslib.TableRef : DAvarslib.Ref
---@field public type "Table"
---@field public table DAvarslib.Collectable<table>
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
---@return integer variablesReference
function variables.tableRef(table, mode, showMeta, extra, evalName)
  mode = mode or "pairs"
  for id,varRef in pairs(refs) do
    if varRef.type == "Table" and ---@cast varRef DAvarslib.TableRef
      varRef.table() == table and varRef.mode == mode and
      varRef.showMeta == showMeta and varRef.extra == extra then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "Table",
    table = collectable(table, id),
    mode = mode,
    showMeta = showMeta,
    extra = extra,
    evalName = evalName,
  }
  return id
end


---@class DAvarslib.LuaObjectRef : DAvarslib.Ref
---@field public type "LuaObject"
---@field public object DAvarslib.Collectable<LuaObject>
---@field public classname string
---@field public evalName string

--- Generate a variablesReference for a LuaObject
---@param luaObject LuaObject
---@param classname string
---@param evalName? string
---@return number variablesReference
function variables.luaObjectRef(luaObject,classname,evalName)
  if not luaObjectInfo.expandKeys[classname] then return 0 end
  for id,varRef in pairs(refs) do
    if varRef.type == "LuaObject" and ---@cast varRef DAvarslib.LuaObjectRef
      varRef.object() == luaObject then
      return id
    end
  end
  local id = nextID()
  refs[id] = {
    type = "LuaObject",
    object = collectable(luaObject, id),
    classname = classname,
    evalName = evalName
  }
  return id
end


---@param classname string
---@param object LuaObject
---@param short? boolean
---@return string lineitem
---@return string classname
local function describeLuaObject(classname,object,short)
  ---@type string
  local lineitem
  if classname == "LuaCustomTable" then
      lineitem = sformat("%d item%s", #object, #object~=1 and "s" or "" )
  else
    if luaObjectInfo.alwaysValid[smatch(classname, "^([^.]+)%.?")] or object.valid then
      local lineitemfmt = luaObjectInfo.lineItem[classname]
      lineitem = sformat("<%s>", classname)
      local litype = type(lineitemfmt)
      if litype == "function" then
        -- don't crash a debug session for a bad formatter...
        local success,result = pcall(lineitemfmt,object,short)
        if success then lineitem = result end
      elseif litype == "string" and not short then
        lineitem = stringInterp(lineitemfmt,nil,object,"luaobjectline")
      end
    else
      lineitem = sformat("<Invalid %s>", classname)
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
      local mt = dgetmetatable(value) --[[@as metatable_debug]]
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
          lineitem = stringInterp(debugline,nil,value,"metadebugline")
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
          local inext = 1 ---@type integer?
          if next(value) then
            ---@type string[]
            local innerpairs = { "{ " }
            for k,v in pairs(value) do
              if k == inext then
                innerpairs[#innerpairs + 1] = sformat([[%s, ]], (variables.describe(v,true)))
                inext = inext + 1
              else
                inext = nil
                if type(k) == "string" and smatch(k, "^[a-zA-Z_][a-zA-Z0-9_]*$") then
                  innerpairs[#innerpairs + 1] = sformat([[%s=%s, ]], k, (variables.describe(v,true)))
                else
                  innerpairs[#innerpairs + 1] = sformat([[[%s]=%s, ]], (variables.describe(k,true)), (variables.describe(v,true)))
                end

              end
            end
            innerpairs[#innerpairs + 1] = "}"
            lineitem = tconcat(innerpairs)
          else
            -- this is an empty table!
            lineitem = "{}"
          end
        end
      end
    end
  elseif vtype == "function" then
    local info = dgetinfo(value, "nS")
    lineitem = "<function>"
    if not short then
      if info.what == "C" then
        lineitem = "<C function>"
      elseif info.what == "Lua" then
        lineitem = sformat("<Lua function %s:%d>", info.source and normalizeLuaSource(info.source),info.linedefined)
      elseif info.what == "main" then
        lineitem = sformat("<main chunk %s>", info.source and normalizeLuaSource(info.source))
      end
    end
  elseif vtype == "userdata" then ---@cast value LuaObject
    local classname = luaObjectInfo.try_object_name(value)
    if classname then
      lineitem,vtype = describeLuaObject(classname,value,short)
    else -- non LuaObject userdata?!?!
      lineitem = "<userdata>"
    end
  elseif vtype == "string" then
    lineitem = sformat("%q", value)
  else -- boolean, number, nil
    lineitem = tostring(value)
  end
  return lineitem,vtype
end

--- Generate a default debug view for `value` named `name`
---@param name string | nil
---@param value any
---@param evalName string | nil
---@return DebugProtocol.Variable
function variables.create(name,value,evalName)
  local lineitem,vtype = variables.describe(value)
  local variablesReference = 0
  ---@type integer|nil
  local namedVariables
  ---@type integer|nil
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
  elseif ssub(vtype,1,3) == "Lua" then
    variablesReference = variables.luaObjectRef(value,vtype,evalName)
  elseif vtype == "table" then
    local mt = dgetmetatable(value) --[[@as metatable_debug]]
    if not mt or mt.__debugcontents == nil then
      variablesReference = variables.tableRef(value,nil,nil,nil,evalName)
      namedVariables = 0
      indexedVariables = rawlen(value)
      ---@type integer|nil
      local namesStartAfter = indexedVariables
      if namesStartAfter == 0 then
        namesStartAfter = nil
      else
        indexedVariables = indexedVariables + 1 --vscode assumes indexes start at 0, so pad one extra
      end
      for k,v in next,value,namesStartAfter do
        namedVariables = namedVariables + 1
      end
      if not mt and namedVariables == 0 and indexedVariables >= 1 and type(value[1]) == "string" then
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
    local info = dgetinfo(value, "u")
    if info.nups > 0 then
      variablesReference = variables.funcRef(value)
    end
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

--- Generate a debug error object
---@param message string
---@return table
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

---@type table<metatable,string>
local knownMetatables = {}
variables.knownMetatables = knownMetatables

---@class metatable_debug: metatable
---@field __debugline string|(fun(self:table, short?:boolean):string)|nil
---@field __debugtype string|nil
---@field __debugcontents DebugAdapter.DebugContents<any,any,any>|false|nil
---@field __debugvisualize (fun(self:table):table)|nil

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
---@param seq integer
---@param filter nil | 'indexed' | 'named'
---@param start nil | integer
---@param count nil | integer
function DAvars.variables(variablesReference,seq,filter,start,count)
  if not dispatch.find("variables",variablesReference,seq,filter,start,count) then
    json.response{seq = seq, body = {{
      name= "Expired variablesReference",
      value= "Expired variablesReference ref="..variablesReference.." seq="..seq,
      variablesReference= 0,
      presentationHint = {kind="virtual"},
    }}}
  end
end

---@param variablesReference integer
---@param seq integer
---@param filter nil | 'indexed' | 'named'
---@param start nil | integer
---@param count nil | integer
---@return boolean
function dispatch.__inner.variables(variablesReference,seq,filter,start,count)
  ---@type DAvarslib.Ref
  local varRef = refs[variablesReference]
  if not varRef then return false end

  ---@type DebugProtocol.Variable[]
  local vars = {}
  if varRef.type == "Locals" then
    ---@cast varRef DAvarslib.ScopeRef
    local mode = varRef.mode
    local hasTemps =  false
    local i = 1

    if mode == "varargs" then
      i = -1
      while true do
        local name,value = dgetlocal(varRef.frameId,i)
        if not name then break end
        vars[#vars + 1] = variables.create(sformat("(*vararg %d)", -i),value)
        i = i - 1
      end
    else
      ---@type {[string]:{index:number, reg:number}}
      local shadow = {}
      while true do
        local name,value = dgetlocal(varRef.frameId,i)
        if not name then break end
        local isTemp = ssub(name,1,1) == "("
        if isTemp then hasTemps = true end
        if (mode == "temps" and isTemp) or (not mode and not isTemp) then
          ---@type string
          local evalName
          if isTemp then
            name = sformat("%s %d)",ssub(name,1,-2),i)
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
          tinsert(vars,1,{
            name = "<temporaries>", value = "<temporaries>",
            variablesReference = variables.scopeRef(varRef.frameId,"Locals","temps"),
            presentationHint = {kind="virtual"},
          })
        end
        local info = dgetinfo(varRef.frameId,"u")
        if info.isvararg then
          local varargidx = info.nparams + 1
          if hasTemps then varargidx = varargidx + 1 end
          tinsert(vars,varargidx,{
            name = "<varargs>", value = "<varargs>",
            variablesReference = variables.scopeRef(varRef.frameId,"Locals","varargs"),
            presentationHint = {kind="virtual"},
          })
        end
      end
    end
  elseif varRef.type == "Upvalues" then
    ---@cast varRef DAvarslib.ScopeRef
    local func = dgetinfo(varRef.frameId,"f").func
    local i = 1
    while true do
      local name,value = dgetupvalue(func,i)
      if not name then break end
      vars[#vars + 1] = variables.create(name,value,name)
      i = i + 1
    end
  elseif varRef.type == "Table" then
    ---@cast varRef DAvarslib.TableRef
    local tabref = varRef.table()
    if not tabref then goto collected end
    -- use debug.getmetatable insead of getmetatable to get raw meta instead of __metatable result
    local mt = dgetmetatable(tabref) --[[@as metatable_debug]]
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
          value = knownMetatables[mt] or "metatable",
          type = "metatable",
          variablesReference = variables.tableRef(mt),
          evaluateName = evalName,
          presentationHint = {kind="virtual"},
        }
      end
      local stop = #tabref
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
        vars[#vars + 1] = variables.create(tostring(i),tabref[i], evalName)
      end
    else
      if mt and type(mt.__debugcontents) == "function" then
        ---@type DebugAdapter.DebugContents<any,any,any>
        local __debugcontents = mt.__debugcontents
        local success, __debugnext, t, firstk = pcall(__debugcontents,tabref,varRef.extra)
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
            value = knownMetatables[mt] or "metatable",
            type = "metatable",
            variablesReference = variables.tableRef(mt),
            evaluateName = evalName,
            presentationHint = {kind="virtual"},
          }
        end

        -- rough heuristic for matching LocalisedStrings
        -- tables with no meta, and [1] that is string
        if filter == "named" and not mt and #tabref >= 1 and type(tabref[1]) == "string" then
          -- print a translation for this with unique id
          local s,mesg = variables.translate(tabref)
          vars[#vars + 1] = {
            name = "<translated>",
            value = s or ("<"..mesg..">"),
            type = "LocalisedString",
            variablesReference = 0,
            presentationHint = { kind = "virtual", attributes = { "readOnly" } },
          }
        end

        ---@alias nextfn fun(t:table,k:any):any,any
        ---@type fun(t:table):nextfn,table,any
        local debugpairs = itermode[varRef.mode]
        if debugpairs then
          local success,f,t,firstk = pcall(debugpairs,tabref)
          if success then
            local len = mt and mt.__len
            if len then
              if not luaObjectInfo.try_object_name(tabref) then
                len = rawlen
              end
            else
              len = rawlen
            end
            local maxindex = len(tabref)
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
                  name = "<"..varRef.mode.." iter error>",
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
    ---@cast varRef DAvarslib.LuaObjectRef
    local object = varRef.object()
    if not object then goto collected end
    if luaObjectInfo.alwaysValid[smatch(varRef.classname,"^([^.]+).?")] or object.valid then
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
              value = sformat("%d item%s", #object, #object~=1 and "s" or ""),
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
              value = id or ("<"..mesg..">")
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
            local success,value = pindex(object,key)
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
    ---@cast varRef DAvarslib.KVRef
    local key = varRef.key()
    local value = varRef.value()
    if key==nil or value==nil then goto collected end
    vars[#vars + 1] = variables.create("<key>",key)
    vars[#vars + 1] = variables.create("<value>",value)
  elseif varRef.type == "Function" then
    ---@cast varRef DAvarslib.FuncRef
    local func = varRef.func()
    if not func then goto collected end
    local i = 1
    while true do
      local name,value = dgetupvalue(func,i)
      if not name then break end
      if name == "" then name = "<"..i..">" end
      vars[#vars + 1] = variables.create(name,value,name)
      i = i + 1
    end
  elseif varRef.type == "Fetch" then
    ---@cast varRef DAvarslib.FetchRef
    local func = varRef.func()
    if not func then goto collected end
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
  goto done
  ::collected::
  -- this ref is holding Collectables that got collected, it shouldn't have even been still-linked...
  refs[variablesReference] = nil
  vars[1] = {
    name= "GCed variablesReference",
    value= "GCed variablesReference ref="..variablesReference.." seq="..seq,
    variablesReference= 0,
    presentationHint = {kind="virtual"},
  }
  ::done::
  json.response{seq = seq, body = vars}
  return true
end

--- DebugAdapter SetVariablesRequest
---@param variablesReference integer
---@param name string
---@param value string
---@param seq number
---@return boolean?
function DAvars.setVariable(variablesReference, name, value, seq)
  if not dispatch.find("setVariable", variablesReference, name, value, seq) then
    json.response{seq = seq, body = {type="error",value="no such ref"}}
  end
end

---@param variablesReference integer
---@param name string
---@param value string
---@param seq number
---@return boolean
function dispatch.__inner.setVariable(variablesReference, name, value, seq)
  local varRef = refs[variablesReference]
  if not varRef then return false end

  if varRef.type == "Locals" then
    ---@cast varRef DAvarslib.ScopeRef
    if varRef.mode ~= "varargs" then
      local i = 1
      local localindex
      local matchname,matchidx = smatch(name, "^([_%a][_%w]*)@(%d+)$")
      if matchname then
        local lname = dgetlocal(varRef.frameId,matchidx)
        if lname == matchname then
          localindex = matchidx
        else
          json.response{seq = seq, body = {
            type="error",
            value="name mismatch at register "..matchidx.." expected `"..matchname.."` got `"..lname.."`"
          }}
          return true
        end
      else
        while true do
          local lname = dgetlocal(varRef.frameId,i)
          if not lname then break end
          if ssub(lname,1,1) == "(" then
            lname = sformat("%s %d)",ssub(lname,1,-2),i)
          end
          if lname == name then
            localindex = i
          end
          i = i + 1
        end
      end
      if localindex then
        local goodvalue,newvalue = evaluateInternal(varRef.frameId+1,nil,"setvar",value)
        if goodvalue then
          dsetlocal(varRef.frameId,localindex,newvalue)
          json.response{seq = seq, body = variables.create(nil,newvalue)}
          return true
        else
          json.response{seq = seq, body = {type="error",value=newvalue}}
          return true
        end
      else
        json.response{seq = seq, body = {type="error",value="named var not present"}}
        return true
      end
    else
      local i = -1
      while true do
        local vaname = dgetlocal(varRef.frameId,i)
        if not vaname then break end
        vaname = sformat("(*vararg %d)",-i)
        if vaname == name then
          local goodvalue,newvalue = evaluateInternal(varRef.frameId+1,nil,"setvar",value)
          if goodvalue then
            dsetlocal(varRef.frameId,i,newvalue)
            json.response{seq = seq, body = variables.create(nil,newvalue)}
            return true
          else
            json.response{seq = seq, body = {type="error",value=newvalue}}
            return true
          end
        end
        i = i - 1
      end
    end
    json.response{seq = seq, body = {type="error",value="invalid local name"}}
    return true
  elseif varRef.type == "Upvalues" then
    ---@cast varRef DAvarslib.ScopeRef
    local func = dgetinfo(varRef.frameId,"f").func
    local i = 1
    while true do
      local upname = dgetupvalue(func,i)
      if not upname then break end
      if upname == name then
        local goodvalue,newvalue = evaluateInternal(varRef.frameId+1,nil,"setvar",value)
        if goodvalue then
          dsetupvalue(func,i,newvalue)
          json.response{seq = seq, body = variables.create(nil,newvalue)}
          return true
        else
          json.response{seq = seq, body = {type="error",value=newvalue}}
          return true
        end
      end
      i = i + 1
    end
    json.response{seq = seq, body = {type="error",value="invalid upval name"}}
    return true
  elseif varRef.type == "Table" or varRef.type == "LuaObject" then
    -- special names "[]" and others aren't valid lua so it won't parse anyway
    local goodname,newname = evaluateInternal(nil,nil,"setvar",name)
    if goodname then
      local alsoLookIn ---@type table|LuaObject
      if varRef.type == "Table" then
        ---@cast varRef DAvarslib.TableRef
        alsoLookIn = varRef.table()
      elseif varRef.type == "LuaObject" then
        ---@cast varRef DAvarslib.LuaObjectRef
        alsoLookIn = varRef.object()
      end
      local goodvalue,newvalue = evaluateInternal(nil,alsoLookIn,"setvar",value)
      if not goodvalue then
        json.response{seq = seq, body = {type="error",value=newvalue}}
        return true
      end
      -- this could fail if table has __newindex or LuaObject property is read only or wrong type, etc
      local goodassign,mesg = pnewindex(alsoLookIn,newname,newvalue)
      if not goodassign then
        json.response{seq = seq, body = {type="error",value=mesg}}
        return true
      end

      -- it could even fail silently, or coerce the value to another type,
      -- so fetch the value back instead of assuming it set...
      -- also, refresh the value even if we didn't update it
      local _,resultvalue = pindex(alsoLookIn,newname)
      json.response{seq = seq, body = variables.create(nil,resultvalue)}
      return true
    else
      json.response{seq = seq, body = {type="error",value="invalid property name"}}
      return true
    end
  else
    json.response{seq = seq, body = {type="error",value="cannot set on this ref type"}}
    return true
  end
end

---Called by VSCode to retreive source for a function
---@param id number
---@param seq number request sequence number
---@param internal boolean Don't look in other LuaStates
---@return boolean
function DAvars.source(id, seq, internal)

  local ref = sourcerefs[id]
  if ref then
    json.response{seq=seq, body=ref.source}
    return true
  end
  if internal then return false end
  -- or remote lookup to find a long ref in another lua...
  if dispatch.find("source", id, seq, true) then
    return true
  end

  json.response{seq=seq, body=nil}
  return false
end
dispatch.__inner.source = DAvars.source

if env.data then
  -- data stage clears package.loaded between files, so we stash a copy in Lua registry too
  local reg = dgetregistry()
  reg.__DAVariables = variables
end

return variables