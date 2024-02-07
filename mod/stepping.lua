local require = require
local pairs = pairs
local type = type

local nextuple = require("__debugadapter__/iterutil.lua").nextuple

--this has to be defined before requiring other files so they can mark functions as ignored
---@type {[function]:true}
local stepIgnoreFuncs = {}
-- make it weak keys so it doesn't keep an otherwise-dead function around
setmetatable(stepIgnoreFuncs,{__mode="k"})
local __DebugAdapter = __DebugAdapter

---@class DebugAdapter.Stepping
local DAstep = {}

---Mark a function or table of functions (keys and values, deep) to be ignored by the stepping hook
---@generic T : table|function
---@param f T
---@return T
local function stepIgnore(f)
  local tf = type(f)
  if tf == "function" then
    stepIgnoreFuncs[f] = true
  elseif tf == "table" then
    for k,v in pairs(f) do
      stepIgnore(k)
      stepIgnore(v)
    end
  end
  return f
end
stepIgnore(stepIgnore)

DAstep.stepIgnore = stepIgnore
-- and a direct assignment early for other modules...
__DebugAdapter.stepIgnore = DAstep.stepIgnore

---Check if a function is ignored
---@param f function
---@return boolean
function DAstep.isStepIgnore(f)
  return stepIgnoreFuncs[f]
end
stepIgnore(DAstep.isStepIgnore)

-- capture the raw object
local remote = (type(remote)=="table" and rawget(remote,"__raw")) or remote
local script = (type(script)=="table" and rawget(script,"__raw")) or script

local debug = debug
local string = string
local setmetatable = setmetatable
local print = print

local variables = require("__debugadapter__/variables.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json_encode = require("__debugadapter__/json.lua").encode
local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints

---@type table<string,table<number,DebugProtocol.SourceBreakpoint>>
local breakpoints = {}
---@type number?
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

---@type boolean?
local step_instr

---@param source string
---@return table<number,DebugProtocol.SourceBreakpoint>?
local function filebreaks(source)
  ---@type string?
  local nsource = normalizeLuaSource(source)
  if nsource == "=(dostring)" then
    local sourceref = variables.sourceRef(source,true)
    if sourceref then
      nsource = "&ref "..sourceref.sourceReference
    else
      return nil
    end
  end

  return breakpoints[nsource]
end

---@param source? string
local function hook_rate(source)
  if not source or stepdepth or filebreaks(source) then
    if step_instr then
      return "cr", 1
    else
      return "clr"
    end
  end
  return "cr"
end

---@type table<string,true>
local isDumpIgnore = {}

--- Disable dumping (disassmbly, breakpoint location validation) for a file or list of files
---@param source string|string[] exact source name, e.g. `"@__modname__/file.lua"`
function DAstep.dumpIgnore(source)
  local tsource = type(source)
  if tsource == "string" then
    isDumpIgnore[source] = true
  elseif tsource == "table" then
    for _, asource in pairs(source) do
      isDumpIgnore[asource] = true
    end
  end
end

local hook
do
  local getinfo = debug.getinfo
  local debugprompt = debug.debug

  --- report a new `Source` event on entry to a main chunk
  ---@param info debuginfo
  local function sourceEvent(info)
    local s = normalizeLuaSource(info.source)
    local dasource = { name = s, path = s }
    --[=[if s == "=(dostring)" then
      local sourceref = variables.sourceRef(info.source)
      if sourceref then
        dasource = sourceref
      end
      print("\xEF\xB7\x91"..json_encode{ event="source", body={
        source = dasource,
        dump = enc(string.dump(info.func))
      }})
      debugprompt()
    else]=]
    if s:sub(1,1) == "@" then
      local dump
      if not isDumpIgnore[s] then
        dump = "\xEF\xB7\x95" .. variables.buffer(string.dump(info.func))
      end
      print("\xEF\xB7\x91"..json_encode{event="source", body={ source = dasource, dump = dump }})
      debugprompt()
    end
  end

--[[
  event        | pass stepinfo | check bp hook
  call:        |               |
  none -> lua  | in            | check
  none -> C    |               |
  C -> lua     | in            | check
  C -> C       |               |
  lua -> C     | out           |
  lua -> lua   |               | check

  tail call:   |               |
  (lua) -> lua |               | check

  return:      |               |
  none <- lua  | out           |
  none <- C    |               |
  C <- lua     | out           |
  C <- C       |               |
  lua <- C     | in            | check
  lua <- lua   |               | check
]]

  ---@param source string
  local function bp_hook(source)
    debug.sethook(hook,hook_rate(source))
  end

  DAstep.hookstats = { line = 0, tail = 0, call = 0, main = 0, ret = 0, }

  ---debug hook function
  ---@param event string
  function hook(event)
    if event == "line" or event == "count" then
      DAstep.hookstats.line = DAstep.hookstats.line +1
      local info = getinfo(2,"Slf")
      local ignored = stepIgnoreFuncs[info.func]
      if ignored then return end
      local fb = filebreaks(info.source)
      local line = info.currentline
      if stepdepth and stepdepth<=0 then
        stepdepth = nil
        print("\xEF\xB7\x91"..json_encode{event="stopped", body={
          reason = "step",
          threadId = __DebugAdapter.this_thread,
          }})
        debugprompt()
      elseif runningBreak() then
        print("\xEF\xB7\x91"..json_encode{event="running", body={
          threadId = __DebugAdapter.this_thread,
          }})
        debugprompt()
      else
        if fb then
          ---@type DebugProtocol.SourceBreakpoint
          local b = fb[line]
          if b then
            -- 0 is getinfo, 1 is sethook callback, 2 is at breakpoint
            local frameId = 3

            -- check b.condition and b.hitConditon
            local isHit = true

            if b.condition then
              local success,conditionResult = __DebugAdapter.evaluateInternal(frameId,nil,"breakpoint",b.condition)
              if success and (not conditionResult) then
                isHit = false
              end
            end

            if isHit and b.hitCondition then -- only counts if condition was true
              b.hits = (b.hits or 0) + 1
              local success,hitResult = __DebugAdapter.evaluateInternal(frameId,nil,"breakpoint",b.hitCondition)
              if success and type(hitResult) == "number" and b.hits < hitResult then
                isHit = false
              end
            end

            if isHit then
              if b.logMessage then
                -- parse and print logMessage as an expression in the scope of the breakpoint
                local result,exprs = __DebugAdapter.stringInterp(b.logMessage,frameId,nil,"logpoint")
                setmetatable(exprs,{
                  __debugline = function() return result end,
                  __debugtype = "DebugAdapter.LogPointResult",
                })
                local varresult = variables.create(nil,{exprs}, nil)
                __DebugAdapter.outputEvent(
                  {output=result, variablesReference=varresult.variablesReference},
                  {source=normalizeLuaSource(info.source), currentline=line})
              else
                stepdepth = nil
                print("\xEF\xB7\x91"..json_encode{event="stopped", body={
                  reason = "breakpoint",
                  threadId = __DebugAdapter.this_thread,
                  }})
                debugprompt()
              end
              b.hits = nil
            end
          end
        end
      end
      bp_hook(info.source)
    elseif event == "tail call" then
      DAstep.hookstats.tail = DAstep.hookstats.tail +1
      local info = getinfo(2,"Sf")
      if info.what == "main" then
        DAstep.hookstats.main = DAstep.hookstats.main +1
        sourceEvent(info)
      end
      bp_hook(info.source)

    elseif event == "call" then
      DAstep.hookstats.call = DAstep.hookstats.call +1
      local info = getinfo(2,"Sf")
      if info.what == "main" then
        DAstep.hookstats.main = DAstep.hookstats.main +1
        sourceEvent(info)
      end

      if stepdepth and stepdepth >= 0 then
        stepdepth = stepdepth + 1
      end

      local parent = getinfo(3,"S")
      local info_is_lua = info.what == "Lua" or info.what == "main"
      if script then
        local parent_is_lua = parent and (parent.what == "Lua" or parent.what == "main")
        if parent_is_lua and not info_is_lua then
          __DebugAdapter.setStepping(stepdepth, step_instr)
          __DebugAdapter.step(nil)
        elseif not parent_is_lua and info_is_lua then
          __DebugAdapter.step(__DebugAdapter.getStepping())
        end
      end

      if not parent then
        print("\xEF\xB7\x91"..json_encode{event="running", body={
          threadId = __DebugAdapter.this_thread,
          }})
        debugprompt()
        bp_hook(info.source)
      elseif info_is_lua then
        bp_hook(info.source)
      end

    elseif event == "return" then
      DAstep.hookstats.ret = DAstep.hookstats.ret +1
      local info = getinfo(2,"S")
      if info.what == "main" and info.source == "@__core__/lualib/noise.lua" then
        local i,k,v
        i = 0
        repeat
          i = i + 1
          k,v = debug.getlocal(2,i)
        until not k or k == "noise_expression_metatable"
        if v then
          require("__debugadapter__/noise.lua")(v)
          __DebugAdapter.print("installed noise expression hook", nil, nil, "console")
        else
          __DebugAdapter.print("failed to install noise expression hook", nil, nil, "console")
        end
      end

      local parent = getinfo(3,"S")
      local parent_is_lua = parent and (parent.what == "Lua" or parent.what == "main")
      if script then
        local info_is_lua = info.what == "Lua" or info.what == "main"
        if parent_is_lua and not info_is_lua then
          __DebugAdapter.step(__DebugAdapter.getStepping())
        elseif not parent_is_lua and info_is_lua then
          __DebugAdapter.setStepping(stepdepth, step_instr)
          __DebugAdapter.step(nil)
        end
      end

      if stepdepth and stepdepth >= 0 then
        stepdepth = stepdepth - 1
      end

      if parent_is_lua then
        bp_hook(parent.source)
      end
      if not parent then
        print(serpent.line(DAstep.hookstats))
        DAstep.hookstats = { line = 0, tail = 0, call = 0, main = 0, ret = 0, }
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
  stepIgnore(stack_has_location)

  function on_exception (mesg)
    debug.sethook()
    if not stack_has_location() then
      __DebugAdapter.getStepping()
      debug.sethook(hook,hook_rate())
      return
    end
    local mtype = type(mesg)
    -- don't bother breaking when a remote.call's error bubbles up, we've already had that one...
    if mtype == "string" and (
        mesg:match("^Error when running interface function") or
        mesg:match("^The mod [a-zA-Z0-9 _-]+ %([0-9.]+%) caused a non%-recoverable error")
        )then
      __DebugAdapter.getStepping()
      debug.sethook(hook,hook_rate())
      return
    end

    __DebugAdapter.print_exception("unhandled",mesg)
    debug.debug()

    __DebugAdapter.getStepping()
    debug.sethook(hook,hook_rate())
  end
  -- shared for stack trace to know to skip one extra
  DAstep.on_exception = on_exception
end

function DAstep.attach()
  debug.sethook(hook,hook_rate())
  -- on_error is api for instrument mods to catch errors
  if on_error then
    on_error(on_exception)
  end
end

---@param source string
---@param breaks? DebugProtocol.SourceBreakpoint[]
function DAstep.setBreakpoints(source,breaks)
  if breaks then
    ---@type table<number,DebugProtocol.SourceBreakpoint>
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
  ---@type string
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

function DAstep.canRemoteCall()
  -- remote.call is only legal from within events, game catches all but on_load
  -- during on_load, script exists and the root of the stack is no longer the main chunk
  return game or script and not isMainChunk()
end

---@param change string
function DAstep.updateBreakpoints(change)
  -- pass it around to everyone if possible, else just set it here...
  if DAstep.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "updateBreakpoints", change)
  else
    local source,changedbreaks = ReadBreakpoints(change)
    if source then
      DAstep.setBreakpoints(source,changedbreaks)
    else

    end
  end
end

---@overload fun(source:string):table<number,DebugProtocol.SourceBreakpoint>
---@overload fun():table<string,table<number,DebugProtocol.SourceBreakpoint>>
function DAstep.dumpBreakpoints(source)
  if source then
    return breakpoints[source]
  else
    return breakpoints
  end
end

---@param depth? number
---@param instruction? boolean
function DAstep.step(depth,instruction)
  if depth and stepdepth then
    print(("step %d with existing depth! %d"):format(depth,stepdepth))
  end
  local rehook = instruction~=step_instr
  stepdepth = depth
  step_instr = instruction
  if rehook then
    debug.sethook(hook,hook_rate())
  end
end

do
  -- functions for passing stepping state across context-switches by handing it to main DA vm

  ---@type number?
  local cross_stepping
  ---@type boolean?
  local cross_step_instr

  ---@param clear? boolean default true
  ---@return number? stepping
  ---@return boolean? step_instr
  function DAstep.getStepping(clear)
    if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
      return remote.call--[[@as fun(string,string,boolean?):number?,boolean?]]("debugadapter", "getStepping", clear)
    else
      local stepping,step_instr = cross_stepping, cross_step_instr
      if clear ~= false then
        cross_stepping,cross_step_instr = nil,nil
      end

      return stepping,step_instr
    end
  end

  ---@param stepping? number
  ---@param step_instr? boolean
  function DAstep.setStepping(stepping, step_instr)
    if script and script.mod_name ~= "debugadapter" and __DebugAdapter.canRemoteCall() and remote.interfaces["debugadapter"] then
      return remote.call("debugadapter", "setStepping", stepping, step_instr)
    else
      cross_stepping = stepping
      cross_step_instr = step_instr
    end
  end
end

local vmeta = {
  __debugline = "<Debug Adapter Stepping Module>",
  __debugtype = "DebugAdapter.Stepping",
  __debugcontents =function ()
    return nextuple, {
      ["<breakpoints>"] = {breakpoints, {rawName = true, virtual = true}},
      ["<stepdepth>"] = {stepdepth, {rawName = true, virtual = true}},
    }
  end,
}
stepIgnore(vmeta)
return setmetatable(DAstep,vmeta)