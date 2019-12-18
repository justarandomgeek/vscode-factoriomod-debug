-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = {}
local stepIgnoreFuncs = {}

local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")

local levelpath
if script.mod_name == "level" then
  ---@param modname string
  ---@param basepath string
  function __DebugAdapter.levelPath(modname,basepath)
    levelpath = {
      modname = modname,
      basepath = basepath,
    }
  end
end

---@param source string
---@return string
local function normalizeLuaSource(source)
  local modname,filename = source:match("__(.+)__/(.+)")
  if not modname then
    --startup tracing sometimes gives absolute path of the scenario script, turn it back into the usual form...
    filename = source:match("currently%-playing/(.+)")
    if filename then
      modname = "level"
    end
  end
  -- scenario scripts may provide hints to where they came from...
  if modname == "level" then
    if levelpath then
      modname = levelpath.modname
      filename = levelpath.basepath .. filename
    end
  end

  if modname == "level" then
    -- we *still* can't identify level properly, so just give up...
    return string.format("LEVEL/%s",filename)
  elseif modname == "core" or modname == "base" then
    -- these are under data path with no version in dir name
    return string.format("DATA/%s/%s",modname,filename)
  elseif modname == nil then
    --something totally unrecognized?
    return source
  else
    -- we found it! This will be a path relative to the `mods` directory.
    local modver = game.active_mods[modname]
    return string.format("MOD/%s_%s/%s",modname,modver,filename)
  end
end
stepIgnoreFuncs[normalizeLuaSource] = true

local breakpoints = {}
local variablesReferences = {}
local step = nil
local stepdepth = 0

local Variable -- this will be filled in later with a function...

local remoteStack

-- hook remote.call so i can step into it across mods...

---@param remoteUpStack StackFrame[]
local function remoteStepIn(remotestep,remoteUpStack)
  if remoteStack then
    print(("WARN: %s"):format(serpent.line(remoteStack)))
  end
  remoteStack = remoteUpStack
  if remotestep ~= "over" then
    step = remotestep
  end
end
stepIgnoreFuncs[remoteStepIn] = true

local function remoteStepOut()
  local s = step
  step = nil
  remoteStack = nil
  return s
end
stepIgnoreFuncs[remoteStepOut] = true

local origremote = remote
local function remotestepcall(modname,method,...)
  local remotename = "__debugadapter_"..modname
  local remotehasdebug = origremote.interfaces[remotename]
  if remotehasdebug then
    origremote.call(remotename,"remoteStepIn",step, __DebugAdapter.stackTrace(-2, nil, true))
  end
  local result = {origremote.call(modname,method,...)}
  if remotehasdebug then
    step = origremote.call(remotename,"remoteStepOut")
  end
  return table.unpack(result)
end
stepIgnoreFuncs[remotestepcall] = true

local function remoteindex(t,k)
  if k == "call" then
    return remotestepcall
  else
    return origremote[k]
  end
end
stepIgnoreFuncs[remoteindex] = true

local function remotenewindex() end
stepIgnoreFuncs[remotenewindex] = true

remote = { __original = origremote}
setmetatable(remote,{
  __index = remoteindex,
  __newindex = remotenewindex,
})

function __DebugAdapter.attach()
  local getinfo = debug.getinfo
  local sub = string.sub
  local format = string.format
  local debugprompt = debug.debug
  debug.sethook(function(event,line)
    local ignored = stepIgnoreFuncs[getinfo(2,"f").func]
    if ignored then return end
    if event == "line" then
      local s = getinfo(2,"S").source
      -- startup logging gets all the serpent loads of `global`
      -- serpent itself will also always show up as one of these
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        if step == "in" or step == "next" or (step == "over" and stepdepth==0) then
          step = nil
          print(format("DBG: step %s:%d", s, line))
          debugprompt()
        else
          local filebreaks = breakpoints[s]
          if filebreaks then
            local b = filebreaks[line]
            if b == true then
              print(format("DBG: breakpoint %s:%d", s, line))
              debugprompt()
            elseif type(b) == "string" then
              -- parse and print logMessage as an expression in the scope of the breakpoint
              -- 0 is getinfo, 1 is sethook callback, 2 is at breakpoint
              local frameId = 3
              local success,result = __DebugAdapter.evaluateInternal(frameId,"logpoint",b)
              local logpoint
              if success then
                local varresult = Variable(nil,result)
                logpoint = {
                  output = varresult.value,
                  variablesReference = varresult.variablesReference,
                  filePath = s,
                  line = line,
                }
              else
                logpoint = {output = result, filePath = s, line = line }
              end
              print("DBGlogpoint: " .. game.table_to_json(logpoint))
            end
          end
        end
        -- cleanup variablesReferences
        variablesReferences = {}
      end
    --ignore "tail call" since it's just one of each
    elseif event == "call" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        if step == "over" or step == "out" then
          stepdepth = stepdepth + 1
        end
      end
    elseif event == "return" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        if step == "over" then
          stepdepth = stepdepth - 1
        elseif step == "out" then
          if stepdepth == 0 then
            step = "next"
          end
          stepdepth = stepdepth - 1
        end
      end
    end
  end,"clr")
end

function __DebugAdapter.detach()
  debug.sethook()
end

---@param source string
---@param breaks SourceBreakpoint[]
---@return Breakpoint[]
function __DebugAdapter.setBreakpoints(source,breaks)
  if breaks then
    local filebreaks = {}
    breakpoints[source] = filebreaks
    for _,bp in pairs(breaks) do
      filebreaks[bp.line] = bp.logMessage or true
    end
  else
    breakpoints[source] = nil
  end
end

function __DebugAdapter.step(steptype)
  step = steptype or "next"
  stepdepth = 0
  print("DBGstep")
end

---@param startFrame integer | nil
---@param levels integer | nil
---@param forRemote boolean | nil
---@return StackFrame[]
function __DebugAdapter.stackTrace(startFrame, levels, forRemote)
  local offset = 5 -- 0 is getinfo, 1 is stackTrace, 2 is debug command, 3 is debug.debug, 4 is sethook callback, 5 is at breakpoint
  local i = (startFrame or 0) + offset
  local stackFrames = {}
  while true do
    local info = debug.getinfo(i,"nSlt")
    if not info then break end
    local framename = info.name or "(name unavailable)"
    if forRemote then
      framename = ("[%s] %s"):format(script.mod_name, framename)
    end
    local stackFrame = {
      id = i,
      name = framename,
      line = info.currentline,
      moduleId = forRemote and script.mod_name,
      presentationHint = forRemote and "subtle",
      source = {
        name = normalizeLuaSource(info.source),
        path = normalizeLuaSource(info.source),
      }
    }
    stackFrames[#stackFrames+1] = stackFrame
    i = i + 1
    if #stackFrames == levels then break end
  end
  if remoteStack then
    for _,frame in pairs(remoteStack) do
      frame.id = i
      stackFrames[#stackFrames+1] = frame
      i = i + 1
    end
  end
  if forRemote then
    return stackFrames
  else
    print("DBGstack: " .. game.table_to_json(stackFrames))
  end
end
stepIgnoreFuncs[__DebugAdapter.stackTrace] = true

---@return Module[]
function __DebugAdapter.modules()
  local modules = {}
  for name,version in pairs(game.active_mods) do
    modules[#modules+1] = {
      id = name, name = name,
      version = version,
    }
  end
  modules[#modules+1] = { id = "level", name = "level", }
  print("DBGmodules: " .. game.table_to_json(modules))
end

---@param frameId number
---@param name string
---@return number
local function scopeVarRef(frameId,name)
  local id = #variablesReferences+1
  variablesReferences[id] = {
    type = name,
    frameId = frameId,
  }
  return id
end

---@param table table
---@param mode string "pairs"|"ipairs"|"count"
---@return number
local function tableVarRef(table, mode)
  for id,varRef in pairs(variablesReferences) do
    if varRef.table == table then return id end
  end
  local id = #variablesReferences+1
  variablesReferences[id] = {
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
local function luaObjectVarRef(luaObject,classname)
  if luaObjectInfo.noExpand[classname] then return 0 end
  for id,varRef in pairs(variablesReferences) do
    if varRef.object == luaObject then return id end
  end
  local id = #variablesReferences+1
  variablesReferences[id] = {
    type = "LuaObject",
    object = luaObject,
    classname = classname,
  }
  return id
end

---@param frameId number
---@return Scope[]
function __DebugAdapter.scopes(frameId)
  if debug.getinfo(frameId,"f") then
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      -- Global
      { name = "Globals", variablesReference = tableVarRef(_G) },
      -- Locals
      { name = "Locals", variablesReference = scopeVarRef(frameId,"Locals") },
      -- Upvalues
      { name = "Upvalues", variablesReference = scopeVarRef(frameId,"Upvalues") },
    }}))
  else
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      { name = "Remote Variables Unavaialbe", variablesReference = 0 },
    }}))
  end
end

---@param obj LuaObject
---@return string
local function LuaObjectType(obj)
  local t = rawget(obj, "luaObjectType")
  if t == nil then
    --[[No way to avoid a pcall unfortunately]]
    local success, help = pcall(function(obj) return obj.help() end, obj)
    if not success then
      --[[Extract type from error message, LuaStruct errors have "Classname: " others have "Classname "]]
      t = string.sub(help, 1, string.find(help, ":? ") - 1)
      --[[LuaStruct currently doens't identify what kind of struct, and has a different message. Will be fixed in 0.18 ]]
      if t == "LuaStruct::luaIndex" then t = "LuaStruct" end
    else
      --[[Extract type from help message]]
      t = string.sub(help, 10, string.find(help, ":") - 1)
    end
    rawset(obj, "luaObjectType", t)
  end
  return t
end

---@param name any
---@param value any
---@return Variable
Variable = function(name,value)
  local namestr = serpent.line(name,{maxlevel = 1, nocode = true, metatostring=true})
  local vtype = type(value)
  if vtype == "table" then
    -- only check __self and metatable, since top level objects (game, script, etc) don't have the magic string in .isluaobject
    if type(value.__self) == "userdata" and getmetatable(value) == "private" then
      vtype = LuaObjectType(value)
      if vtype == "LuaCustomTable" then
        return {
          name = namestr,
          value = ("%d items"):format(#value),
          type = vtype,
          variablesReference = tableVarRef(value),
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
          variablesReference = luaObjectVarRef(value,vtype),
        }
      end
    else
      return {
        name = namestr,
        value = serpent.line(value,{maxlevel = 1, nocode = true, metatostring=true}),
        type = vtype,
        variablesReference = tableVarRef(value),
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
  local varRef = variablesReferences[variablesReference]
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
        vars[#vars + 1] = Variable(name,value)
        i = i + 1
      end
      i = -1
      while true do
        local name,value = debug.getlocal(varRef.frameId,i)
        if not name then break end
        vars[#vars + 1] = Variable(("(*vararg %d)"):format(-i),value)
        i = i - 1
      end
    elseif varRef.type == "Upvalues" then
      local func = debug.getinfo(varRef.frameId,"f").func
      local i = 1
      while true do
        local name,value = debug.getupvalue(func,i)
        if not name then break end
        vars[#vars + 1] = Variable(name,value)
        i = i + 1
      end
    elseif varRef.type == "Table" then
      if varRef.useCount then
        for i=1,#varRef.table do
          vars[#vars + 1] = Variable(i,varRef.table[i])
        end
      else
        for k,v in (varRef.useIpairs and ipairs or pairs)(varRef.table) do
          vars[#vars + 1] = Variable(k,v)
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
            presentationHint = { kind = "property", attributes = { "readOnly"} },
          }
          vars[#vars + 1] = {
            name = [["valid_for_read"]],
            value = "false",
            type = "boolean",
            variablesReference = 0,
            presentationHint = { kind = "property", attributes = { "readOnly"} },
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
                variablesReference = tableVarRef(object, keyprops.iterMode),
                presentationHint = { kind = "property", attributes = { "readOnly"} },
              }
            else
              local success,value = pcall(function() return object[key] end)
              if success and value ~= nil then
                local var = Variable(key,value)
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
          presentationHint = { kind = "property", attributes = { "readOnly"} },
        }
      end
    end
  end
  print("DBGvars: " .. game.table_to_json({variablesReference = variablesReference, vars = vars}))
end

---@param frameId number
---@param context string
---@param expression string
---@param seq number
function __DebugAdapter.evaluateInternal(frameId,context,expression,seq)
  local env = {}
  setmetatable(env,{
    __index = function(t,k)
      -- go ahead and loop these back...
      if k == "_ENV" or k == "_G" then return t end

      -- find how deep we are, if the expression includes defining new functions and calling them...
      local i = 1
      local offset = 3
      while true do
        local func = debug.getinfo(i,"f").func
        if func == __DebugAdapter.evaluateInternal then
          offset = i - 1
          break
        end
        i = i + 1
      end

      local frame = frameId + offset
      --check for local at frameId
      i = 1
      while true do
        local name,value = debug.getlocal(frame,i)
        if not name then break end
        if name:sub(1,1) ~= "(" then
          if name == k then return value end
        end
        i = i + 1
      end

      --check for upvalue at frameId
      local func = debug.getinfo(frame,"f").func
      i = 1
      while true do
        local name,value = debug.getupvalue(func,i)
        if not name then break end
        if name == k then return value end
        i = i + 1
      end

      --else forward to global lookup...
      return _G[k]
    end,
    __newindex = function(t,k,v)
      -- don't allow setting _ENV or _G in evals
      if k == "_ENV" or k == "_G" then return end

      -- find how deep we are, if the expression includes defining new functions and calling them...
      local i = 1
      local offset = 3
      while true do
        local func = debug.getinfo(i,"f").func
        if func == __DebugAdapter.evaluateInternal then
          offset = i - 1
          break
        end
        i = i + 1
      end

      local frame = frameId + offset
      --check for local at frameId
      i = 1
      while true do
        local name = debug.getlocal(frame,i)
        if not name then break end
        if name:sub(1,1) ~= "(" then
          if name == k then
            debug.setlocal(frame,i,v)
            return
          end
        end
        i = i + 1
      end

      --check for upvalue at frameId
      local func = debug.getinfo(frame,"f").func
      i = 1
      while true do
        local name = debug.getupvalue(func,i)
        if not name then break end
        if not name == "_ENV" then
          if name == k then
            debug.setupvalue(func,i,v)
            return
          end
        end
        i = i + 1
      end

      --else forward to global...
      _G[k] = v
    end
  })
  local chunksrc = ("=(%s)"):format(context or "eval")
  local f, res = load('return '.. expression, chunksrc, "t", env)
  if not f then f, res = load(expression, chunksrc, "t", env) end

  if not f then
    -- invalid expression...
    return false,res
  end

  return pcall(f)
end

---@param frameId number
---@param context string
---@param expression string
---@param seq number
function __DebugAdapter.evaluate(frameId,context,expression,seq)
  local success,result = __DebugAdapter.evaluateInternal(frameId+1,context,expression,seq)
  local evalresult
  if success then
    evalresult = Variable(nil,result)
    evalresult.result = evalresult.value
    evalresult.name = nil
    evalresult.value = nil
    evalresult.seq = seq
  else
    evalresult = {result = result, type="error", variablesReference=0, seq=seq}
  end
  print("DBGeval: " .. game.table_to_json(evalresult))
end

---@param variablesReference integer
---@param name string
---@param value string
---@param seq number
function __DebugAdapter.setVariable(variablesReference, name, value, seq)
  local varRef = variablesReferences[variablesReference]
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
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,oldvalue)}))
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
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,oldvalue)}))
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
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,newvalue)}))
          else
            print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(name,oldvalue)}))
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
          print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(newname,newvalue)}))
        else
          local _,oldvalue = pcall(function() return varRef.table[newname] end)
          print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(newname,oldvalue)}))
        end
      end
    elseif varRef.type == "LuaObject" then
      local goodvalue,newvalue = serpent.load(value,{safe=false})
      local goodname,newname = serpent.load(name,{safe=false}) -- special name "[]" isn't valid lua so it won't parse anyway
      if goodname then
        local success = pcall(function() varRef.object[newname] = newvalue end)
        local _,oldvalue = pcall(function() return varRef.object[newname] end)
        print("DBGsetvar: " .. game.table_to_json({seq = seq, body = Variable(newname,oldvalue)}))
      end
    end
  end
end

-- in addition to the global, set up a remote so we can attach/detach/configure from DA's on_tick
log("debugadapter registered for " .. script.mod_name)
remote.add_interface("__debugadapter_" .. script.mod_name ,{
  attach = __DebugAdapter.attach,
  detach = __DebugAdapter.detach,
  setBreakpoints = __DebugAdapter.setBreakpoints,
  remoteStepIn = remoteStepIn,
  remoteStepOut = remoteStepOut,
})

return __DebugAdapter