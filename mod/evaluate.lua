local variables = require("__debugadapter__/variables.lua")

---@param frameId number
---@param context string
---@param expression string
---@param seq number
function __DebugAdapter.evaluateInternal(frameId,context,expression,seq)
  local env = {}
  local getinfo = debug.getinfo
  local getlocal = debug.getlocal
  local getupvalue = debug.getupvalue
  setmetatable(env,{
    __index = function(t,k)
      -- go ahead and loop these back...
      if k == "_ENV" or k == "_G" then return t end

      -- find how deep we are, if the expression includes defining new functions and calling them...
      local i = 1
      local offset = 3
      while true do
        local func = getinfo(i,"f").func
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
        local func = getinfo(i,"f").func
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
