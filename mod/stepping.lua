local pairs = pairs
local type = type

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
local rawxpcall = xpcall
local table = table
local error = error
local select = select
local require = require

local nextuple = require("__debugadapter__/iterutil.lua").nextuple
local json = require("__debugadapter__/json.lua")
local dispatch = require("__debugadapter__/dispatch.lua")
local threads = require("__debugadapter__/threads.lua")
local variables = require("__debugadapter__/variables.lua")
local DAprint = require("__debugadapter__/print.lua")
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json_event_prompt = require("__debugadapter__/json.lua").event_prompt
local datastring = require("__debugadapter__/datastring.lua")
local ReadBreakpoints = datastring.ReadBreakpoints

---@type table<string,table<number,DebugProtocol.SourceBreakpoint>>
local breakpoints = {}
---@type number?
local stepdepth = nil
---@type boolean
local step_enabled = false

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
  if not source or step_enabled or filebreaks(source) then
    if step_instr then
      return "cr", 1
    else
      return "clr", (__DebugAdapter.runningBreak or 5000)
    end
  end
  return "cr", (__DebugAdapter.runningBreak or 5000)
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
DAstep.dumpIgnore = DAstep.dumpIgnore

local blockhook
local unhooked = setmetatable({}, {__mode = "k"})
function DAstep.unhook(f)
  local oldblock
  local rehook = function(...)
    blockhook = oldblock
    return ...
  end
  local unhook = function(...)
    oldblock = blockhook
    blockhook = true
    return rehook(f(...))
  end
  unhooked[unhook] = true
  unhooked[rehook] = true
  return unhook
end

local hook
do
  local getinfo = debug.getinfo
  local debugprompt = debug.debug

  --- report a new `Source` event on entry to a main chunk
  ---@param info debuginfo
  local function sourceEvent(info)
    local s = normalizeLuaSource(info.source)
    local dasource
    if s == "=(dostring)" then
      dasource = variables.sourceRef(info.source)
    elseif s:sub(1,1) == "@" then
      dasource = { name = s, path = "\xEF\xB7\x91"..s }
    end

    if dasource then
      local dump
      if not isDumpIgnore[s] then
        local rawdump = string.dump(info.func)
        dump = variables.buffer(rawdump)
      end
      json_event_prompt{event="source", body={ source = dasource, dump = dump }}
      debugprompt()
    end
  end

  ---@param source string
  local function bp_hook(source)
    debug.sethook(hook,hook_rate(source))
  end


--[[
  line:
    step_enabled - stepping hook
    bp in file?
  count:
    step_enabled - count=1, stepping hook + running_break
    ~step_enabled - count=5000, always running_break

  check bp hook
  tail call (lua) -> lua
  call * -> lua
  return lua <- *

  pass stepinfo
    isapi = C & upvals > 0
    in
      call none -> *
      call isapi -> *
      return * <- isapi
    out
      call * -> isapi
      return none <- *
      return isapi <- *
]]

  ---debug hook function
  ---@param event string
  function hook(event)
    if blockhook then return end
    local info = getinfo(2,"Slfu")
    if unhooked[info.func] then return end
    if event == "line" then
      local ignored = stepIgnoreFuncs[info.func]
      if ignored then return end
      if step_enabled and stepdepth and stepdepth<=0 then
        stepdepth = nil
        json_event_prompt{event="stopped", body={
          reason = "step",
          threadId = threads.this_thread,
          }}
        debugprompt()
        bp_hook(info.source)
      else
        local fb = filebreaks(info.source)
        local line = info.currentline
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
                DAprint.outputEvent(
                  {output=result, variablesReference=varresult.variablesReference},
                  info)
              else
                stepdepth = nil
                json_event_prompt{event="stopped", body={
                  reason = "breakpoint",
                  threadId = threads.this_thread,
                  }}
                debugprompt()
                bp_hook(info.source)
              end
              b.hits = nil
            end
          end
        end
      end
    elseif event == "count" then
      if step_instr then
        if stepdepth and stepdepth<=0 then
          stepdepth = nil
          json_event_prompt{event="stopped", body={
            reason = "step",
            threadId = threads.this_thread,
            }}
          debugprompt()
          bp_hook(info.source)
        elseif runningBreak() then
          json_event_prompt{event="running", body={
            threadId = threads.this_thread,
            }}
          debugprompt()
          bp_hook(info.source)
        end
      else
        json_event_prompt{event="running", body={
          threadId = threads.this_thread,
          }}
        debugprompt()
        bp_hook(info.source)
      end
    elseif event == "tail call" then
      if info.what == "main" then
        sourceEvent(info)
      end
      bp_hook(info.source)

    elseif event == "call" then
      if info.what == "main" then
        sourceEvent(info)
      end

      if stepdepth and stepdepth >= 0 then
        stepdepth = stepdepth + 1
      end


      local parent = getinfo(3,"Su")
      if script and step_enabled then
        local info_is_api = info.what=="C" and info.nups > 0
        local parent_is_none_or_api = not parent or (parent.what=="C" and parent.nups > 0)
        if info_is_api then
          print("call out "..script.mod_name)
          DAstep.setStepping(stepdepth, step_instr)
          DAstep.step(nil)
        elseif parent_is_none_or_api then
          print("call in "..script.mod_name)
          DAstep.step(DAstep.getStepping())
        end
      end

      if not parent then
        if not step_enabled and not stepIgnoreFuncs[info.func] then
          json_event_prompt{event="running", body={
            threadId = threads.this_thread,
            }}
          debugprompt()
        end
        bp_hook(info.source)
      elseif info.what ~= "C" then
        bp_hook(info.source)
      end

    elseif event == "return" then
      if info.what == "main" and info.source == "@__core__/lualib/noise.lua" then
        local i,k,v
        i = 0
        repeat
          i = i + 1
          k,v = debug.getlocal(2,i)
        until not k or k == "noise_expression_metatable"
        if v then
          require("__debugadapter__/noise.lua")(v)
          DAprint.print("installed noise expression hook", nil, nil, "console")
        else
          DAprint.print("failed to install noise expression hook", nil, nil, "console")
        end
      end

      local parent = getinfo(3,"Su")
      if script and step_enabled then
        local info_is_api = info.what=="C" and info.nups > 0
        local parent_is_none_or_api = not parent or (parent.what=="C" and parent.nups > 0)
        if info_is_api then
          print("ret in "..script.mod_name)
          DAstep.step(DAstep.getStepping())
        elseif parent_is_none_or_api then
          print("ret out "..script.mod_name)
          DAstep.setStepping(stepdepth, step_instr)
          DAstep.step(nil)
        end
      end

      if stepdepth and stepdepth >= 0 then
        stepdepth = stepdepth - 1
      end

      if parent then
        if parent.what ~= "C" then
        bp_hook(parent.source)
        end
      end
    end
  end
end

---Print an exception to the editor
---@param etype string
---@param mesg string|LocalisedString|nil
---@package
local function print_exception(etype,mesg)
  if mesg == nil then mesg = "<nil>" end

  if type(mesg) == "table" and not getmetatable(mesg) and #mesg>=1 and type(mesg[1])=="string" then
    mesg = "\xEF\xB7\x94"..variables.translate(mesg)
  end

  json.event_prompt{event="exception", body={
    threadId = threads.this_thread,
    filter = etype,
    mesg = mesg,
    }}
end

local on_exception
if __DebugAdapter.instrument then
  local function stack_has_location()
    local i = 4
    -- 1 = stack_has_location, 2 = on_exception,
    -- 3 = pCallWithStackTraceMessageHandler, 4 = at exception
    local info = debug.getinfo(i,"Sf")
    repeat
      if (info.what ~= "C") and (info.source:sub(1,1) ~= "=") and not DAstep.isStepIgnore(info.func) then
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
      DAstep.getStepping()
      debug.sethook(hook,hook_rate())
      return
    end
    local mtype = type(mesg)
    -- don't bother breaking when a remote.call's error bubbles up, we've already had that one...
    if mtype == "string" and (
        mesg:match("^Error when running interface function") or
        mesg:match("^The mod [a-zA-Z0-9 _-]+ %([0-9.]+%) caused a non%-recoverable error")
        )then
      DAstep.getStepping()
      debug.sethook(hook,hook_rate())
      return
    end

    print_exception("unhandled",mesg)
    debug.debug()

    DAstep.getStepping()
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
  if instrument then
    instrument.on_error(on_exception)
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

---@param change string
function DAstep.updateBreakpoints(change)
  -- pass it around to everyone if possible, else just set it here...
  if dispatch.canRemoteCall() and remote.interfaces["debugadapter"] then
    remote.call("debugadapter", "updateBreakpoints", change)
  else
    local source,changedbreaks = ReadBreakpoints(change)
    if source then
      DAstep.setBreakpoints(source,changedbreaks)
    else

    end
  end
end

---@param depth? number
---@param instruction? boolean
function DAstep.step(depth,instruction)
  if script then
    print("step "..script.mod_name.." "..tostring(depth).." "..tostring(instruction))
  end
  if depth and stepdepth then
    print(("step %d with existing depth! %d"):format(depth,stepdepth))
  end
  stepdepth = depth
  step_instr = instruction
end

function DAstep.step_enabled(state)
  print("step_enabled="..tostring(state))
  if step_enabled == state then return end
  -- pass it around to everyone if possible, else just set it here...
  if dispatch.canRemoteCall() then
    local call = remote.call
    for remotename,_ in pairs(remote.interfaces) do
      local modname = remotename:match("^__debugadapter_(.+)$")
      if modname then
        call(remotename,"step_enabled",state)
      end
    end
  else
    print("local")
    step_enabled = state
  end
end

function DAstep.step_enabled_inner(state)
  step_enabled = state
end
unhooked[DAstep.step_enabled_inner] = true

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
    if script and script.mod_name ~= "debugadapter" and dispatch.canRemoteCall() and remote.interfaces["debugadapter"] then
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
    if script and script.mod_name ~= "debugadapter" and dispatch.canRemoteCall() and remote.interfaces["debugadapter"] then
      return remote.call("debugadapter", "setStepping", stepping, step_instr)
    else
      cross_stepping = stepping
      cross_step_instr = step_instr
    end
  end
end

---Generate a breakpoint or exception from mod code
---@param mesg string|LocalisedString|nil
---@public
function DAstep.breakpoint(mesg)
  debug.sethook()
  if mesg then
    print_exception("manual",mesg)
  else
    json.event_prompt{event="stopped", body={
      reason = "breakpoint",
      threadId = threads.this_thread,
      }}
  end
  debug.debug()
  return DAstep.attach()
end


---Terminate a debug session from mod code
---@public
function DAstep.terminate()
  debug.sethook()
  print("\xEF\xB7\x90\xEE\x80\x8C")
  debug.debug()
end

---Generate handlers for pcall/xpcall wrappers
---@param filter string Where the exception was intercepted
---@param user_handler? function When used as xpcall, the exception will pass to this handler after continuing
---@return function
---@package
local function caught(filter, user_handler)
  ---xpcall handler for intercepting pcall/xpcall
  ---@param mesg string|LocalisedString
  ---@return string|LocalisedString mesg
  return stepIgnore(function(mesg)
    debug.sethook()
    print_exception(filter,mesg)
    debug.debug()
    DAstep.attach()
    if user_handler then
      return user_handler(mesg)
    else
      return mesg
    end
  end)
end
stepIgnore(caught)

---`pcall` replacement to redirect the exception to display in the editor
---@param func function
---@vararg any
---@return boolean success
---@return any result
---@return ...
function pcall(func,...)
  return rawxpcall(func, caught("pcall"), ...)
end
stepIgnore(pcall)

---`xpcall` replacement to redirect the exception to display in the editor
---@param func function
---@param user_handler function
---@vararg any
---@return boolean success
---@return any result
---@return ...
function xpcall(func, user_handler, ...)
  return rawxpcall(func, caught("xpcall",user_handler), ...)
end
stepIgnore(xpcall)

-- don't need the rest in data stage...
if script then

  ---@type table<function,string>
  local handlernames = setmetatable({},{__mode="k"})
  ---@type table<string,function>
  local hashandler = {}

  ---@type {[defines.events|uint|string]:function}
  local event_handler = {}
  ---@param id defines.events|string
  ---@param f? function
  ---@return function?
  ---@package
  local function save_event_handler(id,f)
    event_handler[id] = f
    return f
  end

  ---@type {[string]:{[string]:function}}
  local myRemotes = {}

  -- possible entry points (in control stage):
  --   main chunks (identified above as "(main chunk)")
  --     control.lua init and any files it requires
  --     migrations
  --     /c __modname__ command
  --     simulation scripts (as commands)
  --   remote.call
  --   event handlers
  --     if called by raise_event, has event.mod_name
  --   /command handlers
  --   special events:
  --     on_init, on_load, on_configuration_changed, on_nth_tick

  ---Look up the label for an entrypoint function
  ---@param func function
  ---@return string? label
  function DAstep.getEntryLabel(func)
    do
      local handler = handlernames[func]
      if handler then
        return handler
      end
    end
    -- it would be nice to pre-calculate all this, but changing the functions in a
    -- remote table at runtime is actually valid, so an old result may not be correct!
    for name,interface in pairs(myRemotes) do
      for fname,f in pairs(interface) do
        if f == func then
          return "remote "..fname.."::"..name
        end
      end
    end
    return
  end

  ---Record a handler label for a function and return that functions
  ---@generic F:function
  ---@param func? F
  ---@param entryname string
  ---@return F? func
  ---@package
  local function labelhandler(func,entryname)
    if func then
      if handlernames[func] then
        handlernames[func] = "(shared handler)"
      else
        handlernames[func] = entryname
      end
      do
        local oldhandler = hashandler[entryname]
        if oldhandler and oldhandler ~= func then
          DAprint.print("Replacing existing {entryname} {oldhandler} with {func}",nil,3,"console",true)
        end
      end
    end
    hashandler[entryname] = func
    return func
  end
  stepIgnore(labelhandler)

  local oldscript = script
  local newscript = {
    __raw = oldscript
  }

  ---Simulate an event being raised in the target mod ("level" for the scenario).
  ---Event data is not validated in any way.
  ---@param event defines.events|number|string
  ---@param data EventData
  ---@param modname string
  ---@public
  function DAstep.raise_event(event,data,modname)
    if modname and modname ~= oldscript.mod_name then
      if game and remote.interfaces["__debugadapter_"..modname] then
        return remote.call("__debugadapter_"..modname,"raise_event",event,data)
      else
        error("cannot raise events here")
      end
    else
      local f = event_handler[event]
      if f then
        return f(data)
      end
    end
  end

  ---@param f? function
  function newscript.on_init(f)
    oldscript.on_init(labelhandler(f,"on_init handler"))
  end
  newscript.on_init()

  ---@param f? function
  function newscript.on_load(f)
    oldscript.on_load(labelhandler(f,"on_load handler"))
  end
  newscript.on_load()

  ---@param f? function
  function newscript.on_configuration_changed(f)
    return oldscript.on_configuration_changed(labelhandler(f,"on_configuration_changed handler"))
  end

  ---@param tick uint|uint[]|nil
  ---@param f fun(x:NthTickEventData)|nil
  ---@overload fun(x:nil)
  function newscript.on_nth_tick(tick,f)
    if not tick then
      if f then
        -- pass this through for the error...
        return oldscript.on_nth_tick(tick,f)
      else
        -- just in case somebody gives me a `false`...
        return oldscript.on_nth_tick(tick)
      end
    else
      local ttype = type(tick)
      if ttype == "number" then
        return oldscript.on_nth_tick(tick,labelhandler(f,("on_nth_tick %d handler"):format(tick)))
      elseif ttype == "table" then
        return oldscript.on_nth_tick(tick,labelhandler(f,("on_nth_tick {%s} handler"):format(table.concat(tick,","))))
      else
        error("Bad argument `tick` expected number or table got "..ttype,2)
      end
    end
  end

  ---@param event defines.events|string|defines.events[]
  ---@param f fun(e:EventData)|nil
  ---@vararg table
  ---@overload fun(event:defines.events,f:fun(e:EventData)|nil, filters:table)
  ---@overload fun(event:string,f:fun(e:EventData)|nil)
  ---@overload fun(events:defines.events[],f:fun(e:EventData)|nil)
  function newscript.on_event(event,f,...)
    -- on_event checks arg count and throws if event is table and filters is present, even if filters is nil
    local etype = type(event)
    ---@type boolean
    local has_filters = select("#",...)  > 0
    if etype == "number" then ---@cast event defines.events
      local evtname = ("event %d"):format(event)
      for k,v in pairs(defines.events) do
        if event == v then
          ---@type string
          evtname = k
          break
        end
      end
      return oldscript.on_event(event,labelhandler(save_event_handler(event,f), ("%s handler"):format(evtname)),...)
    elseif etype == "string" then
      if has_filters then
        error("Filters can only be used when registering single events.",2)
      end
      return oldscript.on_event(event,labelhandler(save_event_handler(event,f), ("%s handler"):format(event)))
    elseif etype == "table" then
      if has_filters then
        error("Filters can only be used when registering single events.",2)
      end
      for _,e in pairs(event) do
        newscript.on_event(e,f)
      end
    else
      error({"","Invalid Event type ",etype},2)
    end
  end


  local newscriptmeta = {
    __index = oldscript,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) oldscript[k] = v end,
    __debugline = "<LuaBootstrap Debug Proxy>",
    __debugtype = "DebugAdapter.LuaBootstrap",
  }
  setmetatable(
    stepIgnore(newscript),
    stepIgnore(newscriptmeta)
  )

  local oldcommands = commands
  local newcommands = {
    __raw = oldcommands,
  }

  ---@param name string
  ---@param help string|LocalisedString
  ---@param f function
  function newcommands.add_command(name,help,f)
    return oldcommands.add_command(name,help,labelhandler(f, "command /" .. name))
  end

  ---@param name string
  function newcommands.remove_command(name)
    labelhandler(nil, "command /" .. name)
    return oldcommands.remove_command(name)
  end

  local newcommandsmeta = {
    __index = oldcommands,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) oldcommands[k] = v end,
    __debugline = "<LuaCommandProcessor Debug Proxy>",
    __debugtype = "DebugAdapter.LuaCommandProcessor",
  }
  setmetatable(
    stepIgnore(newcommands),
    stepIgnore(newcommandsmeta)
  )

  local oldremote = remote
  local newremote = {
    __raw = oldremote,
  }

  ---@param remotename string
  ---@param funcs table<string,function>
  function newremote.add_interface(remotename,funcs)
    myRemotes[remotename] = funcs
    return oldremote.add_interface(remotename,funcs)
  end

  ---@param remotename string
  function newremote.remove_interface(remotename)
    myRemotes[remotename] = nil
    return oldremote.remove_interface(remotename)
  end

  local remotemeta = {
    __index = oldremote,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) oldremote[k] = v end,
    __debugline = "<LuaRemote Debug Proxy>",
    __debugtype = "DebugAdapter.LuaRemote",
    __debugcontents = function()
      return nextuple, {
        ["interfaces"] = {oldremote.interfaces},
        ["<raw>"] = {oldremote, {rawName = true, virtual = true}},
        ["<myRemotes>"] = {myRemotes, {rawName = true, virtual = true}},
      }
    end,
  }
  setmetatable(
    stepIgnore(newremote),
    stepIgnore(remotemeta)
  )

  script = newscript
  commands = newcommands
  remote = newremote
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