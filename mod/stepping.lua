--this has to be defined before requiring other files so they can mark functions as ignored
local stepIgnoreFuncs = {}
---@param f function
local __DebugAdapter = __DebugAdapter
local function stepIgnore(f)
  stepIgnoreFuncs[f] = true
end
__DebugAdapter.stepIgnore = stepIgnore

local require = require
local debug = debug
local print = print
local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")

local breakpoints = {}
local stepmode = nil
local stepdepth = 0

function __DebugAdapter.attach()
  local getinfo = debug.getinfo
  local string = string
  local sub = string.sub
  local format = string.format
  local debugprompt = debug.debug
  local evaluateInternal = __DebugAdapter.evaluateInternal
  local stringInterp = __DebugAdapter.stringInterp
  debug.sethook(function(event,line)
    local ignored = stepIgnoreFuncs[getinfo(2,"f").func]
    if ignored then return end
    if not game then return end --TODO: remove this when normalizeLuaSource switches to script.active_mods in 0.18
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
                  print("DBGlogpoint: " .. game.table_to_json(logpoint))
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
        s = normalizeLuaSource(s)
        local smode = stepmode
        if smode == "over" or smode == "out" then
          stepdepth = stepdepth + 1
        end
      end
    elseif event == "return" then
      local s = getinfo(2,"S").source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
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
      filebreaks[bp.line] = bp
    end
  else
    breakpoints[source] = nil
  end
end

---@param source string
---@return Breakpoint | Breakpoint[]
function __DebugAdapter.dumpBreakpoints(source)
  if source then
    return breakpoints[source]
  else
    return breakpoints
  end
end

---@param steptype string "remote"*("next" | "in" | "over" | "out")
---@param silent nil | boolean
function __DebugAdapter.step(steptype,silent)
  stepmode = steptype
  if steptype == "over" or steptype == "out" then
    if not silent then
      stepdepth = 0
    end
    if stepdepth ~= 0 then
      print(("%s with existing depth! %d"):format(steptype,stepdepth))
    end
  end
  if not silent then
    print("DBGstep")
  end
end
stepIgnore(__DebugAdapter.step)

---@return string "remote"*("next" | "in" | "over" | "out")
function __DebugAdapter.currentStep()
  return stepmode
end
stepIgnore(__DebugAdapter.currentStep)

local vcreate = variables.create
return setmetatable({},{
  __debugline = "<Debug Adapter Stepping Module>",
  __debugchildren = function(t) return {
    vcreate("<breakpoints>",breakpoints),
    vcreate("<stepmode>",stepmode),
    vcreate("<stepdepth>",stepdepth),
  } end,
})