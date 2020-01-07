--this has to be defined before requiring other files so they can mark functions as ignored
local stepIgnoreFuncs = {}
-- make it weak keys so it doesn't keep an otherwise-dead function around
setmetatable(stepIgnoreFuncs,{__mode="k"})
---@param f function
local __DebugAdapter = __DebugAdapter
local function stepIgnore(f)
  stepIgnoreFuncs[f] = true
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
end
stepIgnore(stepIgnoreAll)
__DebugAdapter.stepIgnoreAll = stepIgnoreAll

-- capture the raw object, before remotestepping hooks it or through the hook
local remote = rawget(remote,"__raw") or remote

local debug = debug
local string = string
local require = require
local print = print
local pairs = pairs
local type = type

local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require("__debugadapter__/json.lua")
local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints

---@type table<string,table<number,SourceBreakpoint>>
local breakpoints = {}
local stepmode = nil
local stepdepth = 0

function __DebugAdapter.attach()
  local getinfo = debug.getinfo
  local sub = string.sub
  local format = string.format
  local debugprompt = debug.debug
  local evaluateInternal = __DebugAdapter.evaluateInternal
  local stringInterp = __DebugAdapter.stringInterp
  debug.sethook(function(event,line)
    local ignored = stepIgnoreFuncs[getinfo(2,"f").func]
    if ignored then return end
    if script and not game then return end --TODO: remove this when normalizeLuaSource switches to script.active_mods in 0.18
    if event == "line" then
      local s = getinfo(2,"S").source
      -- startup logging gets all the serpent loads of `global`
      -- serpent itself will also always show up as one of these
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        local smode = stepmode
        if smode == "in" or smode == "next" or (smode == "over" and stepdepth<=0) then
          stepmode = nil
          stepdepth = 0
          print(format("DBG: step %s:%d", s, line))
          debugprompt()
          -- cleanup variablesReferences
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
                  if (stepmode == "over") then
                    stepmode = nil
                    stepdepth = 0
                  end
                  print(format("DBG: breakpoint %s:%d", s, line))
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
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        local smode = stepmode
        if smode == "over" or smode == "out" then
          stepdepth = stepdepth + 1
        end
      end
    elseif event == "return" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        local smode = stepmode
        if smode == "over" then
          stepdepth = stepdepth - 1
        elseif smode == "out" then
          local sdepth = stepdepth
          if sdepth <= 0 then
            stepmode = "next"
            sdepth = 0
          end
          stepdepth = sdepth - 1
        end
      end
    end
  end,"clr")
end
stepIgnore(__DebugAdapter.attach)

function __DebugAdapter.detach()
  debug.sethook()
end
stepIgnore(__DebugAdapter.detach)

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
stepIgnore(__DebugAdapter.setBreakpoints)

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

---@param change string
function __DebugAdapter.updateBreakpoints(change)
  -- pass it around to everyone if possible, else just set it here...
  -- remote.call is only legal from within events, game catches all but on_load
  -- during on_load, script exists and the root of the stack is no longer the main chunk
  if game or script and not isMainChunk() then
    remote.call("debugadapter", "updateBreakpoints", change)
  else
    local source,changedbreaks = ReadBreakpoints(change)
    __DebugAdapter.setBreakpoints(source,changedbreaks)
  end
end
stepIgnore(__DebugAdapter.updateBreakpoints)

---@param source string
---@return Breakpoint[] | Breakpoint
function __DebugAdapter.dumpBreakpoints(source)
  if source then
    return breakpoints[source]
  else
    return breakpoints
  end
end
stepIgnore(__DebugAdapter.dumpBreakpoints)

---@param steptype string "remote"*("next" | "in" | "over" | "out")
---@param internal boolean | nil
function __DebugAdapter.step(steptype,internal)
  stepmode = steptype
  if steptype == "over" or steptype == "out" then
    if not internal then
      stepdepth = 0
    end
    if stepdepth ~= 0 then
      print(("%s with existing depth! %d"):format(steptype,stepdepth))
    end
  end
end
stepIgnore(__DebugAdapter.step)

---@return string "remote"*("next" | "in" | "over" | "out")
function __DebugAdapter.currentStep()
  return stepmode
end
stepIgnore(__DebugAdapter.currentStep)

local vcreate = variables.create
local vmeta = {
  __debugline = "<Debug Adapter Stepping Module>",
  __debugchildren = function(t) return {
    vcreate("<breakpoints>",breakpoints),
    vcreate("<stepmode>",stepmode),
    vcreate("<stepdepth>",stepdepth),
  } end,
}
stepIgnore(vmeta.__debugchildren)
return setmetatable({},vmeta)