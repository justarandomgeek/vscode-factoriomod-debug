-- this is a global so the vscode extension can get to it from debug.debug()
__DebugAdapter = {}

--this has to be defined before requiring other files so they can mark functions as ignored
local stepIgnoreFuncs = {}
---@param f function
function __DebugAdapter.stepIgnore(f)
  stepIgnoreFuncs[f] = true
end

local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local remotestepping = require("__debugadapter__/remotestepping.lua")

local breakpoints = {}
local stepmode = nil
local stepdepth = 0

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
        if stepmode == "in" or stepmode == "next" or (stepmode == "over" and stepdepth==0) then
          stepmode = nil
          print(format("DBG: step %s:%d", s, line))
          debugprompt()
        else
          local filebreaks = breakpoints[s]
          if filebreaks then
            local b = filebreaks[line]
            if b == true then
              if (stepmode == "over") then
                stepmode = nil
                stepdepth = 0
              end
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
        variables.clear()
      end
    --ignore "tail call" since it's just one of each
    elseif event == "call" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        if stepmode == "over" or stepmode == "out" then
          stepdepth = stepdepth + 1
        end
      end
    elseif event == "return" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        if stepmode == "over" then
          stepdepth = stepdepth - 1
        elseif stepmode == "out" then
          if stepdepth == 0 then
            stepmode = "next"
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

---@param steptype string "remote"*("next" | "in" | "over" | "out")
---@param silent nil | boolean
function __DebugAdapter.step(steptype,silent)
  stepmode = steptype
  if stepmode == "over" and stepdepth ~= 0 then
    print(("over with existing depth! %d"):format(stepdepth))
  end
  if not silent then
    print("DBGstep")
  end
end
__DebugAdapter.stepIgnore(__DebugAdapter.step)

---@return string "remote"*("next" | "in" | "over" | "out")
function __DebugAdapter.currentStep()
  return stepmode
end
__DebugAdapter.stepIgnore(__DebugAdapter.currentStep)


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

  local remoteStack = remotestepping.parentStack()
  if remoteStack then
    local remoteFName = remotestepping.entryFunction()
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

-- don't hook myself!
if script.mod_name ~= "debugadapter" then
  -- in addition to the global, set up a remote so we can attach/detach/configure from DA's on_tick
  log("debugadapter registered for " .. script.mod_name)
  remote.add_interface("__debugadapter_" .. script.mod_name ,{
    attach = __DebugAdapter.attach,
    detach = __DebugAdapter.detach,
    setBreakpoints = __DebugAdapter.setBreakpoints,
    remoteStepIn = remotestepping.stepIn,
    remoteStepOut = remotestepping.stepOut,
  })
end

return __DebugAdapter