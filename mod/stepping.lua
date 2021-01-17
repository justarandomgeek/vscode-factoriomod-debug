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

-- capture the raw object, before remotestepping hooks it or through the hook
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
local remotestepping
if script then -- don't attempt to hook in data stage
  remotestepping = require("__debugadapter__/remotestepping.lua")
end


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
do
  local getinfo = debug.getinfo
  local sub = string.sub
  local format = string.format
  local debugprompt = debug.debug
  local evaluateInternal = __DebugAdapter.evaluateInternal
  local stringInterp = __DebugAdapter.stringInterp
  local pendingeventlike = {}
  function hook(event,line)
    local ignored = stepIgnoreFuncs[getinfo(2,"f").func]
    if ignored then return end
    if event == "line" or event == "count" then
      local s = getinfo(2,"S").source
      -- startup logging gets all the serpent loads of `global`
      -- serpent itself will also always show up as one of these
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        local smode = stepmode
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
          if filebreaks then
            local b = filebreaks[line]
            if b then
              -- 0 is getinfo, 1 is sethook callback, 2 is at breakpoint
              local frameId = 3

              -- check b.condition and b.hitConditon
              local isHit = true

              if b.condition then
                local success,conditionResult = evaluateInternal(frameId,nil,"breakpoint",b.condition)
                if success then
                  isHit = conditionResult
                end
              end

              if b.hitCondition then
                if isHit then -- only counts if condition was true
                  b.hits = (b.hits or 0) + 1
                  local success,hitResult = evaluateInternal(frameId,nil,"breakpoint",b.hitCondition)
                  if success and type(hitResult) == "number" and b.hits < hitResult then
                    isHit = false
                  end
                end
              end

              if isHit then
                if b.logMessage then
                  -- parse and print logMessage as an expression in the scope of the breakpoint
                  local result = stringInterp(b.logMessage,frameId,nil,"logpoint")
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
      end
    --ignore "tail call" since it's just one of each
    elseif event == "call" then
      local info = getinfo(2,"Slf")
      local s = info.source
      if sub(s,1,1) == "@" then
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth + 1
        end
      end
      local parent = getinfo(3,"f")
      if not parent then -- top of a new stack
        if info.what == "main" then
          -- main chunks: loading `global` from save, console commands, file chunks
          __DebugAdapter.pushEntryPointName("main")
        elseif info.what == "Lua" then
          -- note that this won't see any entrypoints which are stepIgnore,
          -- which includes all break-on-exception instrumented entry points
          -- have to check for remotestepping here as we might also end up here for
          -- C++ code that invokes Lua metamethods, like _ENV __index
          local remoteFName = remotestepping and remotestepping.isRemote(info.func)
          if remoteFName then
            -- remote.calls that don't go through my hooks. no stacks, but at least we can name it...
            __DebugAdapter.pushEntryPointName("remote " .. remoteFName)
          else
            -- i don't know anything useful about these, but i need to push *something* to prevent
            -- misidentifying the new stack if it's re-entrant in another event
            __DebugAdapter.pushEntryPointName("unknown")
          end
        end
      else -- down in a stack
        if script then
          local success,classname,member,v = luaObjectInfo.check_eventlike(3,event)
          if success then
            --print("eventlike",script.mod_name,event,t,k,v)
            local pending = pendingeventlike[info.func]
            if not pending then
              pending = {}
              pendingeventlike[info.func] = pending
            end
            pending[#pending+1] = true

            local label = classname.."::"..member..(v and ("="..__DebugAdapter.describe(v,true)) or "()")
            __DebugAdapter.pushStack({
                source = "api",
                extra = label,
                mod_name = script.mod_name,
                stack = __DebugAdapter.stackTrace(-1, true),
              }, __DebugAdapter.currentStep())
          end
        end
      end
    elseif event == "return" then
      local info = getinfo(2,"Slf")
      local s = info.source
      if sub(s,1,1) == "@" then
        if info.what == "main" then
          if s == "@__core__/lualib/noise.lua" then
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
        end
        if stepdepth and stepdepth >= 0 then
          stepdepth = stepdepth - 1
        end
      end
      local parent = getinfo(3,"f")
      if not parent then -- top of stack
        if info.what == "main" or info.what == "Lua" then
          __DebugAdapter.popEntryPointName()
          if info.what == "main" and not info.source:match("^@__debugadapter__") then
            print("DBG: leaving")
            debugprompt()
          end
          variables.clear()
        end
      else -- down in stack
        if script and pendingeventlike[info.func] then
          -- if this is a waiting eventlike, pop one...
          local pending = pendingeventlike[info.func]
          local count = #pending
          --print("eventlike",script.mod_name,event,pending[count])
          __DebugAdapter.popStack()
          if count == 1 then
            pendingeventlike[info.func] = nil
          else
            pending[count] = nil
          end
        end
      end
    end
  end
end
function __DebugAdapter.attach()
  debug.sethook(hook,"clr")
  -- on_error is api for instrument mods to catch errors
  if on_error then
    on_error(__DebugAdapter.on_exception)
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