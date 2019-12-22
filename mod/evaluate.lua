local variables = require("__debugadapter__/variables.lua")

local function evalmeta(frameId,alsoLookIn)
  local getinfo = debug.getinfo
  local getlocal = debug.getlocal
  local getupvalue = debug.getupvalue
  local env = _ENV
  return {
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
      -- go ahead and loop these back...
      if k == "_ENV" or k == "_G" then return t end
      if k == "__self" then return nil end

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
        -- to locate teh correct stack and fall back to only the global lookups
        local i = 0
        local offset
        while true do
          local info = getinfo(i,"f")
          if info then
            local func = info.func
            if func == __DebugAdapter.evaluateInternal then
              offset = i - 1
              break
            end
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
      if k == "__self" then return end

      if alsoLookIn then
        if k == "self" then
          return -- don't allow setting `self`
        end
        -- this might be a LuaObject and throw on bad lookups...
        local success,result = pcall(function() return alsoLookIn[k] end)
        if success and result then
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
            if func == __DebugAdapter.evaluateInternal then
              offset = i - 1
              break
            end
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
end

---@param frameId number | nil
---@param alsoLookIn table | nil
---@param context string
---@param expression string
---@return boolean
---@return any
function __DebugAdapter.evaluateInternal(frameId,alsoLookIn,context,expression)
  local env = _ENV
  if frameId or alsoLookIn then
    env = setmetatable({},evalmeta(frameId,alsoLookIn))
  end
  local chunksrc = ("=(%s)"):format(context or "eval")
  local f, res = load('return '.. expression, chunksrc, "t", env)
  if not f then f, res = load(expression, chunksrc, "t", env) end

  if not f then
    -- invalid expression...
    return false,res
  end

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
  local info = debug.getinfo(frameId,"f")
  local evalresult
  if info then
    local success,result = __DebugAdapter.evaluateInternal(frameId+1,nil,context,expression)
    if success then
      evalresult = variables.create(nil,result)
      evalresult.result = evalresult.value
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
