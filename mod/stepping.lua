--this has to be defined before requiring other files so they can mark functions as ignored
local stepIgnoreFuncs = {}
-- make it weak keys so it doesn't keep an otherwise-dead function around
setmetatable(stepIgnoreFuncs,{__mode="k"})
---@param f function
local __DebugAdapter = __DebugAdapter
local function stepIgnore(f)
  stepIgnoreFuncs[f] = true
  return f
end
stepIgnore(stepIgnore)
__DebugAdapter.stepIgnore = stepIgnore

local function stepIgnoreAll(t)
  for k,v in pairs(t) do
    if type(k) == "function" then
      stepIgnore(k)
    end
    if type(v) == "function" then
      stepIgnore(v)
    end
  end
  return t
end
stepIgnore(stepIgnoreAll)
__DebugAdapter.stepIgnoreAll = stepIgnoreAll

function __DebugAdapter.isStepIgnore(f)
  return stepIgnoreFuncs[f]
end
stepIgnore(__DebugAdapter.isStepIgnore)

-- capture the raw object
local remote = remote and rawget(remote,"__raw") or remote

local debug = debug
local string = string
local require = require
local print = print
local pairs = pairs
local type = type

local variables = require("__debugadapter__/variables.lua")
local luaObjectInfo = require("__debugadapter__/luaobjectinfo.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require("__debugadapter__/json.lua")
local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints

---@type table<string,table<number,SourceBreakpoint>>
local breakpoints = {}
local stepdepth = nil

local runningBreak
do
  local i = 0
  function runningBreak()
    if i < (__DebugAdapter.runningBreak or 5000) then
      i = i + 1
      return false
    else
      i = 0
      return true
    end
  end
end

local hook
local pending = {}
do
  local getinfo = debug.getinfo
  local sub = string.sub
  local format = string.format
  local debugprompt = debug.debug

  function hook(event,line)
    if event == "line" or event == "count" then
      local ignored = stepIgnoreFuncs[getinfo(2,"f").func]
      if ignored then return end
      local rawsource = getinfo(2,"S").source
      local s = normalizeLuaSource(rawsource)
      if stepdepth and stepdepth<=0 then
        stepdepth = nil
        print(format("DBG: step %s:%d", s, line or -1))
        debugprompt()
        -- cleanup variablesReferences
        variables.clear()
      elseif runningBreak() then
        print("DBG: running")
        debugprompt()
        variables.clear()
      else
        local filebreaks = breakpoints[s]
        if not filebreaks then
          if s == "=(dostring)" then
            local sourceid = variables.sourceRef(rawsource,true)
            if sourceid then
              filebreaks = breakpoints["&ref "..sourceid]
            end
          end
        end
        if filebreaks then
          local b = filebreaks[line]
          if b then
            -- 0 is getinfo, 1 is sethook callback, 2 is at breakpoint
            local frameId = 3

            -- check b.condition and b.hitConditon
            local isHit = true

            if b.condition then
              local success,conditionResult = __DebugAdapter.evaluateInternal(frameId,nil,"breakpoint",b.condition)
              if success then
                isHit = conditionResult
              end
            end

            if b.hitCondition then
              if isHit then -- only counts if condition was true
                b.hits = (b.hits or 0) + 1
                local success,hitResult = __DebugAdapter.evaluateInternal(frameId,nil,"breakpoint",b.hitCondition)
                if success and type(hitResult) == "number" and b.hits < hitResult then
                  isHit = false
                end
              end
            end

            if isHit then
              if b.logMessage then
                -- parse and print logMessage as an expression in the scope of the breakpoint
                local result = __DebugAdapter.stringInterp(b.logMessage,frameId,nil,"logpoint")
                local varresult = variables.create(nil,result)
                local logpoint = {
                  output = varresult.value,
                  variablesReference = varresult.variablesReference,
                  filePath = s,
                  line = line,
                }
                print("DBGlogpoint: " .. json.encode(logpoint))
              else
                stepdepth = nil
                print("DBG: breakpoint")
                debugprompt()
                -- cleanup variablesReferences
                variables.clear()
              end
              b.hits = nil
            end
          end
        end
      end

    --ignore "tail call" since it's just one of each
    elseif event == "call" then
      local info = getinfo(2,"Slf")
      local s = info.source

      local success,classname,member,v = luaObjectInfo.check_eventlike(3,event)
      local parent =  getinfo(3,"f")
      if success then
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth + 1
        end
        -- if current is eventlike do outer stack/stepping pass out
        local label = classname.."::"..member..(v and ("="..__DebugAdapter.describe(v,true)) or "()")
        __DebugAdapter.pushStack({
            source = "api",
            extra = label,
            mod_name = script.mod_name,
            stack = __DebugAdapter.stackTrace(-1, true),
          }, __DebugAdapter.currentStep())
          __DebugAdapter.step(nil,true)
          pending[info.func] = (pending[info.func] or 0) + 1
      elseif (not parent) or pending[parent.func] then
        -- if parent is nil or eventlike do inner stepping pass in
        __DebugAdapter.step(__DebugAdapter.peekStepping(),true)
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth + 1
        end
      else
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth + 1
        end
      end
    elseif event == "return" then
      local info = getinfo(2,"Slf")
      local s = info.source
      if info.what == "main" and s == "@__core__/lualib/noise.lua" then
        local i,k,v
        i = 0
        repeat
          i = i + 1
          k,v = debug.getlocal(2,i)
        until not k or k == "noise_expression_metatable"
        if v then
          require("__debugadapter__/noise.lua")(v)
          log("installed noise expression hook")
        else
          log("failed to install noise expression hook")
        end
      end
      local parent = getinfo(3,"f")
      local p = pending[info.func]
      if p then
        -- if current is eventlike pop stack, do outer stepping pass in
        __DebugAdapter.step(__DebugAdapter.popStack(),true)
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth - 1
        end
        p = p - 1
        if p == 0 then
          pending[info.func] = nil
        else
          pending[info.func] = p
        end
      elseif  (not parent) or pending[parent.func] then
        -- if parent is nil or eventlike do inner stepping pass out
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth - 1
        end
        __DebugAdapter.crossStepping(__DebugAdapter.currentStep())
        __DebugAdapter.step(nil,true)
      else
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth - 1
        end
      end

      if not parent then -- top of stack
        if info.what == "main" or info.what == "Lua" then
          if info.what == "main" and not info.source:match("^@__debugadapter__") then
            print("DBG: leaving")
            debugprompt()
          end
          variables.clear()
        end
      end
    end
  end
end

local on_exception
if __DebugAdapter.instrument then
  local function stack_has_location()
    local i = 4
    -- 1 = stack_has_location, 2 = on_exception,
    -- 3 = pCallWithStackTraceMessageHandler, 4 = at exception
    local info = debug.getinfo(i,"Sf")
    repeat
      if (info.what ~= "C") and (info.source:sub(1,1) ~= "=") and not __DebugAdapter.isStepIgnore(info.func) then
        return true
      end
      i = i + 1
      info = debug.getinfo(i,"Sf")
    until not info
    return false
  end
  __DebugAdapter.stepIgnore(stack_has_location)

  function on_exception (mesg)
    debug.sethook()
    if not stack_has_location() then
      __DebugAdapter.popStack()
      debug.sethook(hook,"clr")
      return
    end
    local mtype = type(mesg)
    -- don't bother breaking when a remote.call's error bubbles up, we've already had that one...
    if mtype == "string" and (
        mesg:match("^Error when running interface function") or
        mesg:match("^The mod [a-zA-Z0-9 _-]+ %([0-9.]+%) caused a non%-recoverable error")
        )then
      __DebugAdapter.popStack()
      debug.sethook(hook,"clr")
      return
    end

    -- if an api was called that threw directly when i expected a re-entrant stack, clean it up...
    -- 0 = get_info, 1 = check_eventlike, 2 = on_exception,
    -- 3 = pCallWithStackTraceMessageHandler, 4 = at execption
    local popped
    local info = debug.getinfo(3,"f")
    local p = pending[info.func]
    if p then
      __DebugAdapter.popStack()
      popped = true
    end

    __DebugAdapter.print_exception("unhandled",mesg)
    debug.debug()
    if not popped then
      __DebugAdapter.popStack()
    end
    debug.sethook(hook,"clr")
    return
  end
  -- shared for stack trace to know to skip one extra
  __DebugAdapter.on_exception = on_exception
end
function __DebugAdapter.attach()
  debug.sethook(hook,"clr")
  -- on_error is api for instrument mods to catch errors
  if on_error then
    on_error(on_exception)
  end
end
---@param source string
---@param breaks SourceBreakpoint[]
function __DebugAdapter.setBreakpoints(source,breaks)
  if breaks then
    local filebreaks = {}
    breakpoints[source] = filebreaks
    for _,bp in pairs(breaks) do
      filebreaks[bp.line] = bp
    end
  else
    breakpoints[source] = nil
  end
end

local function isMainChunk()
  local i = 2 -- no need to check getinfo or isMainChunk
  local what
  local getinfo = debug.getinfo
  while true do
    local info = getinfo(i,"S")
    if info then
      what = info.what
      i = i + 1
    else
      break
    end
  end
  return what == "main"
end
stepIgnore(isMainChunk)

function __DebugAdapter.canRemoteCall()
  -- remote.call is only legal from within events, game catches all but on_load
  -- during on_load, script exists and the root of the stack is no longer the main chunk
  return game or script and not isMainChunk()
end

---@param change string
function __DebugAdapter.updateBreakpoints(change)
  -- pass it around to everyone if possible, else just set it here...
  if __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "updateBreakpoints", change)
  else
    local source,changedbreaks = ReadBreakpoints(change)
    __DebugAdapter.setBreakpoints(source,changedbreaks)
  end
end

---@param source string
---@return Breakpoint[] | Breakpoint
function __DebugAdapter.dumpBreakpoints(source)
  if source then
    return breakpoints[source]
  else
    return breakpoints
  end
end

---@param depth number
function __DebugAdapter.step(depth)
  if depth and stepdepth then
    print(("step %d with existing depth! %d"):format(depth,stepdepth))
  end
  stepdepth = depth
end

---@return number
function __DebugAdapter.currentStep()
  return stepdepth
end

local vcreate = variables.create
local vmeta = {
  __debugline = "<Debug Adapter Stepping Module>",
  __debugtype = "DebugAdapter.Stepping",
  __debugchildren = function(t) return {
    vcreate("<breakpoints>",breakpoints),
    vcreate("<stepdepth>",stepdepth),
  } end,
}
stepIgnoreAll(vmeta)
return setmetatable({},vmeta)