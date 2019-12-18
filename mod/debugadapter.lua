-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = {}
local stepIgnoreFuncs = {}
function __DebugAdapter.stepIgnore(f)
  stepIgnoreFuncs[f] = true
end

local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local variables = require("__debugadapter__/variables.lua")

local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
__DebugAdapter.stepIgnore(normalizeLuaSource)

local breakpoints = {}
local step = nil
local stepdepth = 0

local remoteStack
local remoteFName

-- hook remote.call so i can step into it across mods...

---@param remoteUpStack StackFrame[]
local function remoteStepIn(remotestep,remoteUpStack,fname)
  if remoteStack then
    print(("WARN: overwriting remote stack %s"):format(serpent.line(remoteStack)))
  end
  remoteStack = remoteUpStack
  remoteFName = fname
  if remotestep ~= "over" then
    step = remotestep
  end
end
__DebugAdapter.stepIgnore(remoteStepIn)

local function remoteStepOut()
  local s = step
  step = nil
  remoteStack = nil
  return s
end
__DebugAdapter.stepIgnore(remoteStepOut)

local origremote = remote
local function remotestepcall(remotename,method,...)
  local debugname = "__debugadapter_"..remotename -- assume remotename is modname for now...
  local remotehasdebug = origremote.interfaces[debugname]
  if remotehasdebug then
    origremote.call(debugname,"remoteStepIn",step, __DebugAdapter.stackTrace(-2, nil, true), method)
  end
  local result = {origremote.call(remotename,method,...)}
  if remotehasdebug then
    step = origremote.call(debugname,"remoteStepOut")
  end
  return table.unpack(result)
end
__DebugAdapter.stepIgnore(remotestepcall)

local function remotenewindex() end
__DebugAdapter.stepIgnore(remotenewindex)

remote = {
  call = remotestepcall,
  __raw = origremote,
}
setmetatable(remote,{
  __index = origremote,
  __newindex = remotenewindex,
  __debugline = function() return "LuaRemote Proxy" end,
  __debugpairs = function() return pairs({
    variables.create("interfaces",origremote.interfaces),
    {
      name = "__raw",
      value = "LuaRemote",
      type = "LuaRemote",
      variablesReference = variables.luaObjectRef(origremote,"LuaRemote"),
    },
  }) end,
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
                local varresult = variables.create(nil,result)
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
        variables.refs = {}
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
    local info = debug.getinfo(i,"nSltf")
    if not info then break end
    local framename = info.name or "(name unavailable)"
    if not info.name then
      local name,event = debug.getlocal(i,1)
      if name == "event" and type(event) == "table" and event.name then
        local evtname = ("event %d"):format(event.name)
        for k,v in pairs(defines.events) do
          if event.name == v then
            evtname = k
          end
        end
        framename = ("%s handler"):format(evtname)
      elseif name == nil then
        if script.get_event_handler(defines.events.on_tick) == info.func then
          framename = "on_tick handler"
        end
      end
    end
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
    if remoteFName then
      if forRemote then
        stackFrames[#stackFrames].name = ("[%s] %s"):format(script.mod_name, remoteFName)
      else
        stackFrames[#stackFrames].name = remoteFName
      end

    end
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
__DebugAdapter.stepIgnore(__DebugAdapter.stackTrace)

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
---@return Scope[]
function __DebugAdapter.scopes(frameId)
  if debug.getinfo(frameId,"f") then
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      -- Global
      { name = "Globals", variablesReference = variables.tableRef(_G), expensive = true },
      -- Locals
      { name = "Locals", variablesReference = variables.scopeRef(frameId,"Locals") },
      -- Upvalues
      { name = "Upvalues", variablesReference = variables.scopeRef(frameId,"Upvalues") },
    }}))
  else
    print("DBGscopes: " .. game.table_to_json({frameId = frameId, scopes = {
      { name = "Remote Variables Unavailable", variablesReference = 0 },
    }}))
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
      if varRef.useCount then
        for i=1,#varRef.table do
          vars[#vars + 1] = variables.create(i,varRef.table[i])
        end
      else
        local mt = getmetatable(varRef.table)
        if mt and mt.__debugchildren then
          for _,var in mt.__debugchildren(varRef.table) do
            vars[#vars + 1] = var
          end
        else
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
                variablesReference = variables.tableRef(object, keyprops.iterMode),
                presentationHint = { kind = "property", attributes = { "readOnly"} },
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
          presentationHint = { kind = "property", attributes = { "readOnly"} },
        }
      end
    end
  end
  if #vars == 0 then
    vars[1] = {
      name = "empty",
      value = "empty",
      type = "empty",
      variablesReference = 0,
      presentationHint = { kind = "property", attributes = { "readOnly"} },
    }
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
  local info = debug.getinfo(frameId,"f")
  local evalresult
  if info then
    local success,result = __DebugAdapter.evaluateInternal(frameId+1,context,expression,seq)
    if success then
      evalresult = variables.create(nil,result)
      evalresult.result = evalresult.value
      evalresult.name = nil
      evalresult.value = nil
      evalresult.seq = seq
    else
      evalresult = {result = result, type="error", variablesReference=0, seq=seq}
    end
  else
    evalresult = {result = "Cannot Evaluate in Remote Frame", type="error", variablesReference=0, seq=seq}
  end
  print("DBGeval: " .. game.table_to_json(evalresult))
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