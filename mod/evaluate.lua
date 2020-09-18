local variables = require("__debugadapter__/variables.lua")
local json = require("__debugadapter__/json.lua")
local __DebugAdapter = __DebugAdapter
local debug = debug
local string = string
local print = print
local pcall = pcall -- capture pcall early before entrypoints wraps it
local xpcall = xpcall -- ditto
local setmetatable = setmetatable
local load = load

-- capture the raw object, before remotestepping hooks it or through the hook
local remote = remote and rawget(remote,"__raw") or remote

local function timedpcall(f)
  if game and variables.translate then
    local t = game.create_profiler()
    local res = {pcall(f)}
    t.stop()
    return t,table.unpack(res)
  else
    return nil,pcall(f)
  end
end

local function evalmeta(frameId,alsoLookIn)
  local getinfo = debug.getinfo
  local getlocal = debug.getlocal
  local getupvalue = debug.getupvalue
  local env = _ENV
  local em = {
    __debugline = function(t,short)
      if short then
        return "<Eval Env>"
      end
      local envname
      if frameId then
        envname = (envname or " for") .. " frame " .. frameId
      end
      if alsoLookIn then
        envname = (envname or " for") .. " " .. variables.describe(alsoLookIn,true)
      end

      return ("<Evaluate Environment%s>"):format(envname or "")
    end,
    __index = function(t,k)
      -- go ahead and loop _ENV back...
      if k == "_ENV" then return t end
      -- but _G can force global only lookup, return the real global environment
      if k == "_G" then return env end

      if alsoLookIn then
        if k == "self" then
          return alsoLookIn
        end
        -- this might be a LuaObject and throw on bad lookups...
        local success,result = pcall(function() return alsoLookIn[k] end)
        if success and result then
          return result
        end
      end

      if frameId then
        -- find how deep we are, if the expression includes defining new functions and calling them...
        -- if this table lives longer than the expression (by being returned), this will end up failing
        -- to locate the correct stack and fall back to only the global lookups
        local i = 0
        local offset
        while true do
          local info = getinfo(i,"f")
          if info then
            local func = info.func
            if func == __DebugAdapter.evaluateInternal or func == timedpcall then
              offset = i - 1
              break
            end
          else
            -- we got all the way up the stack without finding where the eval was happening
            -- probably outlived it, so go ahead and and clear the frame to stop looking...
            frameId = nil
            break
          end
          i = i + 1
        end
        if offset then
          local frame = frameId + offset
          --check for local at frameId
          i = 1
          while true do
            local name,value = getlocal(frame,i)
            if not name then break end
            if name:sub(1,1) ~= "(" then
              if name == k then return value end
            end
            i = i + 1
          end

          --check for upvalue at frameId
          local func = getinfo(frame,"f").func
          i = 1
          while true do
            local name,value = getupvalue(func,i)
            if not name then break end
            if name == k then return value end
            i = i + 1
          end
        end
      end

      --else forward to global lookup...
      return env[k]
    end,
    __newindex = function(t,k,v)
      -- don't allow setting _ENV or _G in evals
      if k == "_ENV" or k == "_G" then return end

      if alsoLookIn then
        if k == "self" then
          return -- don't allow setting `self`
        end
        -- this might be a LuaObject and throw on bad lookups...
        local success = pcall(function() return alsoLookIn[k] end)
        if success then
          -- attempt to set, this may throw on bad assignment to LuaObject, but we want to pass that up usually
          alsoLookIn[k] = v
          return
        end
      end


      if frameId then
        -- find how deep we are, if the expression includes defining new functions and calling them...
        local i = 1
        local offset
        while true do
          local info = getinfo(i,"f")
          if info then
            local func = info.func
            if func == __DebugAdapter.evaluateInternal or func == timedpcall then
              offset = i - 1
              break
            end
          else
            -- we got all the way up the stack without finding where the eval was happening
            -- probably outlived it, so go ahead and and clear the frame to stop looking...
            frameId = nil
            break
          end
          i = i + 1
        end
        if offset then
          local frame = frameId + offset
          --check for local at frameId
          i = 1
          while true do
            local name = getlocal(frame,i)
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
          local func = getinfo(frame,"f").func
          i = 1
          while true do
            local name = getupvalue(func,i)
            if not name then break end
            if not name == "_ENV" then
              if name == k then
                debug.setupvalue(func,i,v)
                return
              end
            end
            i = i + 1
          end
        end
      end

      --else forward to global...
      env[k] = v
    end
  }
  return __DebugAdapter.stepIgnoreAll(em)
end
__DebugAdapter.stepIgnore(evalmeta)

---@param frameId number | nil
---@param alsoLookIn table | nil
---@param context string
---@param expression string
---@return boolean
---@return any
function __DebugAdapter.evaluateInternal(frameId,alsoLookIn,context,expression,timed)
  local env = _ENV
  if frameId or alsoLookIn then
    env = setmetatable({},evalmeta(frameId,alsoLookIn))
  end
  local chunksrc = ("=(%s)"):format(context or "eval")
  local f, res = load('return '.. expression, chunksrc, "t", env)
  if not f then f, res = load(expression, chunksrc, "t", env) end

  if not f then
    -- invalid expression...
    if timed then
      return nil,false,res
    else
      return false,res
    end
  end

  local pcall = timed and timedpcall or pcall
  return pcall(f)
end

---@param str string
---@param frameId number | nil
---@param alsoLookIn table | nil
---@param context string
---@return string
function __DebugAdapter.stringInterp(str,frameId,alsoLookIn,context)
  local sub = string.sub
  return string.gsub(str,"(%b{})",
    function(expr)
      if expr == "{[}" then return "{" end
      if expr == "{]}" then return "}" end
      if expr == "{...}" then
        -- expand a comma separated list of short described varargs
        if not frameId then return "<error>" end
        frameId = frameId + 2
        local info = debug.getinfo(frameId,"u")
        if info and info.isvararg then
          local i = -1
          local args = {}
          while true do
            local name,value = debug.getlocal(frameId,i)
            if not name then break end
            args[#args + 1] = variables.describe(value,true)
            i = i - 1
          end
          return table.concat(args,", ")
        else
          return "<error>"
        end
      end
      expr = sub(expr,2,-2)
      local success,result = __DebugAdapter.evaluateInternal(frameId and frameId+3,alsoLookIn,context or "interp",expr)
      if success then
        return variables.describe(result)
      else
        return "<error>"
      end
      return expr
    end)
end

---@param frameId number
---@param context string
---@param expression string
---@param seq number
function __DebugAdapter.evaluate(frameId,context,expression,seq)
  if not frameId then
    -- if you manage to do one of these fast enough for data, go for it...
    if not data and __DebugAdapter.canRemoteCall() and script.mod_name~="level" then
      -- remote to `level` if possible, else just error
      if remote.interfaces["__debugadapter_level"] then
        -- transfer ref out first, just in case...
        __DebugAdapter.transferRef()
        return remote.call("__debugadapter_level","evaluate",frameId,context,expression,seq)
      else
        print("DBGeval: " .. json.encode({result = "`level` not available for eval", type="error", variablesReference=0, seq=seq}))
        return
      end
    end
  end
  local info = not frameId or debug.getinfo(frameId,"f")
  local evalresult
  if info then
    local timer,success,result
    if context == "repl" then
      timer,success,result = __DebugAdapter.evaluateInternal(frameId and frameId+1,nil,context,expression,true)
    else
      success,result = __DebugAdapter.evaluateInternal(frameId and frameId+1,nil,context,expression)
    end
    if success then
      evalresult = variables.create(nil,result,nil,true)
      evalresult.result = evalresult.value
      if context == "visualize" then
        local mtresult = getmetatable(result)
        if mtresult and mtresult.__debugvisualize then
          local function err(e) return debug.traceback("__debugvisualize error: "..e) end
          __DebugAdapter.stepIgnore(err)
          success,result = xpcall(mtresult.__debugvisualize,err,result)
        end
        evalresult.result = json.encode(result)
      end
      evalresult.value = nil
      evalresult.seq = seq
    else
      local outmesg = result
      local tmesg = type(result)
      if variables.translate and tmesg == "table" and (result.object_name == "LuaProfiler" or (not getmetatable(result) and type(result[1])=="string")) then
        outmesg = "{LocalisedString "..variables.translate(result).."}"
      elseif tmesg ~= "string" then
        outmesg = variables.describe(result)
      end
      evalresult = {result = outmesg, type="error", variablesReference=0, seq=seq}
    end
    if timer then -- timer won't be present if variables.translate isn't
      evalresult.timer = variables.translate(timer)
    end
  else
    evalresult = {result = "Cannot Evaluate in Remote Frame", type="error", variablesReference=0, seq=seq}
  end
  print("DBGeval: " .. json.encode(evalresult))
  __DebugAdapter.transferRef()
end