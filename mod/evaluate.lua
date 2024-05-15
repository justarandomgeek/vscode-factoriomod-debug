local json = require("__debugadapter__/json.lua")
local dispatch = require("__debugadapter__/dispatch.lua")
local variables = require("__debugadapter__/variables.lua")
local debug = debug
local dgetinfo = debug.getinfo
local dgetlocal = debug.getlocal
local dsetlocal = debug.setlocal
local dgetupvalue = debug.getupvalue
local dsetupvalue = debug.setupvalue
local dtraceback = debug.traceback
local string = string
local ssub = string.sub
local sgsub = string.gsub
local table = table
local tunpack = table.unpack
local tpack = table.pack
local tconcat = table.concat
local type = type
local getmetatable = getmetatable
local pcall = pcall
local xpcall = xpcall
local setmetatable = setmetatable
local load = load
local pindex = variables.pindex

local env = _ENV
local _ENV = nil

---@class DebugAdapter.Evaluate
local DAEval = {}

---Timed version of `pcall`. If `game.create_profiler()` is available, it will
---be used to measure the execution time of `f`. The timer or nil is added as an
---additional first return value, followed by `pcall`'s normal returns
---@param f function
---@return LuaProfiler|nil
---@return boolean
---@return ...
local function timedpcall(f)
  local game = env.game
  if game then
    ---@type LuaProfiler
    local t = game.create_profiler()
    local res = {pcall(f)}
    t.stop()
    return t,tunpack(res)
  else
    return nil,pcall(f)
  end
end

---@class metatable_debug_env: metatable_debug
---@field __closeframe fun()

---@param env table
---@param frameId? integer|false|nil
---@param alsoLookIn? table|nil
---@return metatable_debug_env
local function evalmeta(env,frameId,alsoLookIn)
  ---@type metatable_debug_env
  local em = {
    __closeframe = function ()
      frameId = false
    end,
    __debugtype = "DebugAdapter.EvalEnv",
    ---@param t table
    ---@param short boolean
    ---@return string
    __debugline = function(t,short)
      if short then
        return "<Eval Env>"
      end
      ---@type string|nil
      local envname
      if frameId == false then
        envname = (envname or " for") .. " closed frame"
      elseif frameId then
        envname = (envname or " for") .. " frame " .. frameId
      end
      if alsoLookIn then
        envname = (envname or " for") .. " " .. variables.describe(alsoLookIn,true)
      end

      return ("<Evaluate Environment%s>"):format(envname or "")
    end,
    ---@param t table
    ---@param k string
    ---@return any
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
        local success,result = pindex(alsoLookIn,k)
        if success then
          return result
        end
      end

      if frameId then
        -- find how deep we are, if the expression includes defining new functions and calling them...
        -- if this table lives longer than the expression (by being returned),
        -- the frameId will be cleared and fall back to only the global lookups
        local i = 0
        ---@type integer|nil
        local offset
        while true do
          local info = dgetinfo(i,"f")
          if info then
            local func = info.func
            if func == DAEval.evaluateInternal then
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
          ---@type boolean
          local islocal
          ---@type any
          local localvalue
          while true do
            local name,value = dgetlocal(frame,i)
            if not name then break end
            if name:sub(1,1) ~= "(" then
              if name == k then
                islocal,localvalue = true,value
              end
            end
            i = i + 1
          end
          if islocal then return localvalue end

          --check for upvalue at frameId
          local func = dgetinfo(frame,"f").func
          i = 1
          while true do
            local name,value = dgetupvalue(func,i)
            if not name then break end
            if name == k then return value end
            i = i + 1
          end
        end
      end

      --else forward to global lookup...
      return env[k]
    end,
    ---@param t table
    ---@param k string
    ---@param v any
    __newindex = function(t,k,v)
      -- don't allow setting _ENV or _G in evals
      if k == "_ENV" or k == "_G" then return end

      if alsoLookIn then
        if k == "self" then
          return -- don't allow setting `self`
        end
        -- this might be a LuaObject and throw on bad lookups...
        local success = pindex(alsoLookIn,k)
        if success then
          -- attempt to set, this may throw on bad assignment to LuaObject, but we want to pass that up usually
          alsoLookIn[k] = v
          return
        end
      end


      if frameId then
        -- find how deep we are, if the expression includes defining new functions and calling them...
        local i = 1
        ---@type integer|nil
        local offset
        while true do
          local info = dgetinfo(i,"f")
          if info then
            local func = info.func
            if func == DAEval.evaluateInternal then
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
          ---@type integer|nil
          local localindex
          while true do
            local name = dgetlocal(frame,i)
            if not name then break end
            if name:sub(1,1) ~= "(" then
              if name == k then
                localindex = i
              end
            end
            i = i + 1
          end
          if localindex then
            dsetlocal(frame,localindex,v)
            return
          end

          --check for upvalue at frameId
          local func = dgetinfo(frame,"f").func
          i = 1
          while true do
            local name = dgetupvalue(func,i)
            if not name then break end
            if not name == "_ENV" then
              if name == k then
                dsetupvalue(func,i,v)
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
  return em
end

---@class DebugAdapter.CountedResult: any[]
---@field n integer

---@param frameId integer|nil
---@param alsoLookIn table|nil
---@param context string|nil
---@param expression string
---@param timed nil|boolean
---@overload fun(frameId:integer|nil,alsoLookIn:table|nil,context:string|nil,expression:string,timed:true): LuaProfiler?,boolean,DebugAdapter.CountedResult|string?
---@overload fun(frameId:integer|nil,alsoLookIn:table|nil,context:string|nil,expression:string,timed?:false|nil): boolean,...
function DAEval.evaluateInternal(frameId,alsoLookIn,context,expression,timed)
  ---@type table
  local eenv = env

  if frameId then
    -- if there's a function here, check if it has an active local or upval
    local i = 0
    ---@type boolean
    local found
    while true do
      i = i+1
      local name,value = dgetlocal(frameId,i)
      if not name then
        if found then
          goto foundenv
        else
          break
        end
      end
      if name == "_ENV" then
        eenv = value
        found = true
      end
    end
    i = 0
    local info = dgetinfo(frameId,"f")
    local func = info.func
    while true do
      i = i+1
      local name,value = dgetupvalue(func,i)
      if not name then break end
      if name == "_ENV" then
        eenv = value
        goto foundenv
      end
    end
  end
  ::foundenv::
  if frameId or alsoLookIn then
    eenv = setmetatable({},evalmeta(eenv,frameId,alsoLookIn))
  end
  local chunksrc = ("=(%s)"):format(context or "eval")
  local f, res = load('return '.. expression, chunksrc, "t", eenv)
  if not f then f, res = load(expression, chunksrc, "t", eenv) end

  if not f then
    -- invalid expression...
    if timed then
      return nil,false,res
    else
      return false,res
    end
  end
  ---@cast f function

  local evalpcall = timed and timedpcall or pcall
  local closeframe = timed and
    function(timer,success,...)
      if frameId then
        local mt = getmetatable(eenv) --[[@as metatable_debug_env]]
        local __closeframe = mt and mt.__closeframe
        if __closeframe then __closeframe() end
      end
      return timer,success,tpack(...)
    end
    or
    function(success,...)
      if frameId then
        local mt = getmetatable(eenv) --[[@as metatable_debug_env]]
        local __closeframe = mt and mt.__closeframe
        if __closeframe then __closeframe() end
      end
      return success,...
    end
  return closeframe(evalpcall(f))
end
dispatch.bind("evaluateInternal", DAEval.evaluateInternal)

---@param str string
---@param frameId? integer
---@param alsoLookIn? table
---@param context? string
---@return string
---@return any[]
function DAEval.stringInterp(str,frameId,alsoLookIn,context)
  ---@type any[]
  local evals = {}
  local evalidx = 1
  local result = sgsub(str,"(%b{})",
    function(expr)
      if expr == "{[}" then
        evals[evalidx] = "{"
        evalidx = evalidx+1
        return "{"
      elseif expr == "{]}" then
        evals[evalidx] = "}"
        evalidx = evalidx+1
        return "}"
      elseif expr == "{...}" then
        -- expand a comma separated list of short described varargs
        if not frameId then
          evals[evalidx] = variables.error("no frame for `...`")
          evalidx = evalidx+1
          return "<error>"
        end
        local fId = frameId + 2
        local info = dgetinfo(fId,"u")
        if info and info.isvararg then
          local i = -1
          ---@type string[]
          local args = {}
          while true do
            local name,value = dgetlocal(fId,i)
            if not name then break end
            args[#args + 1] = variables.describe(value,true)
            i = i - 1
          end
          local result = tconcat(args,", ")
          evals[evalidx] = setmetatable(args,{
            __debugline = "...",
            __debugtype = "vararg",
          })
          evalidx = evalidx+1
          return result
        else
          evals[evalidx] = variables.error("frame for `...` is not vararg")
          evalidx = evalidx+1
          return "<error>"
        end
      end
      expr = ssub(expr,2,-2)
      local success,result = DAEval.evaluateInternal(frameId and frameId+3,alsoLookIn,context or "interp",expr)
      if success then
        evals[evalidx] = result
        evalidx = evalidx+1
        return variables.describe(result)
      else --[[@cast result string]]
        evals[evalidx] = variables.error(result)
        evalidx = evalidx+1
        return "<error>"
      end
    end)
    return result,evals
end
dispatch.bind("stringInterp", DAEval.stringInterp)

---@type metatable_debug
local evalresultmeta = {
  __debugline = function(t)
    ---@type string[]
    local s = {}
    for i=1,t.n do
      s[i] = variables.describe(t[i])
    end
    return tconcat(s,", ")
  end,
  __debugtype = "DebugAdapter.EvalResult",
  __debugcontents = function (t)
    return
      function(t,k)
        if k == nil then
          return 1,t[1]
        end
        if k >= t.n then
          return
        end
        k = k +1
        return k,t[k]
      end,
      t
  end,
}

---@param target? string|integer modname or frameId
---@param context? string
---@param expression string
---@param seq integer
function DAEval.evaluate(target,context,expression,seq)
  local ttarget = type(target)
  local result
  if ttarget == "number" then
    result = dispatch.callFrame(target, "evaluate", context, expression, seq)
  elseif ttarget == "string"then
    result = dispatch.callMod(target, "evaluate", nil, nil, context, expression, seq)
  elseif ttarget == "nil" then
    result = dispatch.callMod("level", "evaluate", nil, nil, context, expression, seq)
  end
  if not result then
    json.response{seq=seq, body={result = "`"..(target or "level").."` not available for eval", type="error", variablesReference=0}}
  end
end

---@param frameId? integer frameId
---@param tag? integer
---@param context? string
---@param expression string
---@param seq integer
function dispatch.__inner.evaluate(frameId,tag,context,expression,seq)
  ---@type DebugProtocol.EvaluateResponseBody
  local evalresult
  if tag and tag ~= 0 then
    frameId = nil
  end
  if not frameId or dgetinfo(frameId,"f") then
    local timer,success,result
    if context == "repl" then
      timer,success,result = DAEval.evaluateInternal(frameId and frameId+1,nil,context,expression,true)
    else
      success,result = DAEval.evaluateInternal(frameId and frameId+1,nil,context,expression)
    end
    ---@cast timer LuaProfiler
    ---@cast success boolean
    if success then
      if context == "repl" then
        ---@cast result DebugAdapter.CountedResult
        if result.n == 0 or result.n == 1 then
          result = result[1]
        else
          setmetatable(result,evalresultmeta)
        end
      end
      do
        local vresult = variables.create(nil,result,nil)
        -- Variable is close enough to EvaluateResponseBody with one field moved...
        evalresult = vresult --[[@as DebugProtocol.EvaluateResponseBody]]
        evalresult.result = vresult.value
      end

      if context == "visualize" then
        local mtresult = getmetatable(result) --[[@as metatable_debug]]
        if mtresult and mtresult.__debugvisualize then
          local function err(e) return dtraceback("__debugvisualize error: "..e) end
          success,result = xpcall(mtresult.__debugvisualize,err,result)
        end
        evalresult.result = json.encode(result)
      end
    else
      if context == "repl" then
        ---@cast result DebugAdapter.CountedResult
        result = result[1]
      end
      ---@cast result any
      local outmesg = result
      local tmesg = type(result)
      if tmesg == "table" and (result--[[@as LuaObject]].object_name == "LuaProfiler" or (not getmetatable(result) and #result>=1 and type(result[1])=="string")) then
        local tref,err = variables.translate(result)
        outmesg = tref or ("<"..err..">")
      elseif tmesg ~= "string" then
        outmesg = variables.describe(result)
      end
      evalresult = {result = outmesg, type="error", variablesReference=0}
    end
    if timer then
      evalresult.timer = variables.translate(timer)
    end
  else
    evalresult = {result = "Invalid Frame in Evaluate", type="error", variablesReference=0}
  end
  json.response{seq=seq, body=evalresult}
end

return DAEval