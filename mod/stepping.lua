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
        local smode = stepmode
        if smode == "over" or smode == "out" then
          stepdepth = stepdepth + 1
        end
      end
      local parent = getinfo(3,"f")
      if not parent then
        if info.func == serpent.dump then
          -- this catches saving and the psuedo-save for crc checks
          __DebugAdapter.pushEntryPointName("saving")
        elseif info.what == "main" then
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
      local parent = getinfo(3,"f")
      if not parent then
        -- top of stack
        if info.what == "main" or info.what == "Lua" then
          __DebugAdapter.popEntryPointName()
        end
      end
    end
  end,"clr")
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

---@param source string
---@return Breakpoint[] | Breakpoint
function __DebugAdapter.dumpBreakpoints(source)
  if source then
    return breakpoints[source]
  else
    return breakpoints
  end
end

---@param steptype string "remote"*("next" | "in" | "over" | "out")
---@param internal boolean | nil
function __DebugAdapter.step(steptype,internal)
  stepmode = steptype
  if steptype == "over" or steptype == "out" then
    if not internal then
      stepdepth = 0
    end
    if stepdepth ~= 0 then
      print(("step %s with existing depth! %d"):format(steptype,stepdepth))
    end
  end
end

---@return string "remote"*("next" | "in" | "over" | "out")
function __DebugAdapter.currentStep()
  return stepmode
end

local vcreate = variables.create
local vmeta = {
  __debugline = "<Debug Adapter Stepping Module>",
  __debugchildren = function(t) return {
    vcreate("<breakpoints>",breakpoints),
    vcreate("<stepmode>",stepmode),
    vcreate("<stepdepth>",stepdepth),
  } end,
}
stepIgnoreAll(vmeta)
return setmetatable({},vmeta)