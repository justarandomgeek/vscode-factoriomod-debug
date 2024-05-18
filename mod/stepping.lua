local pairs = pairs
local type = type
local setmetatable = setmetatable

--this has to be defined before requiring other files so they can mark functions as ignored
---@type {[function]:true}
local stepIgnoreFuncs = {}
-- make it weak keys so it doesn't keep an otherwise-dead function around
setmetatable(stepIgnoreFuncs,{__mode="k"})
local __DebugAdapter = __DebugAdapter
local DAConfig = __DebugAdapter.__config

---@class DebugAdapter.Stepping
local DAstep = {}
---@class DebugAdapter.Stepping.DAP
DAstep.__dap = {}
---@class DebugAdapter.Stepping.Public
DAstep.__pub = {}

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

DAstep.__pub.stepIgnore = stepIgnore

---Check if a function is ignored
---@param f function
---@return boolean
function DAstep.isStepIgnore(f)
  return stepIgnoreFuncs[f]
end
stepIgnore(DAstep.isStepIgnore)

local rawscript = script
local debug = debug
local dgetinfo = debug.getinfo
local dgetlocal = debug.getlocal
local debugprompt = debug.debug
local dsethook = debug.sethook
local string = string
local sdump = string.dump
local ssub = string.sub
local sformat = string.format
local getmetatable = getmetatable
local print = print
local rawxpcall = xpcall
local table = table
local tconcat = table.concat
local error = error
local select = select
local require = require
local rawset = rawset
local defines = defines

local nextuple = require("__debugadapter__/iterutil.lua").nextuple
local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json_event_prompt = require("__debugadapter__/json.lua").event_prompt
local ReadBreakpoints = require("__debugadapter__/datastring.lua").ReadBreakpoints
local threads = require("__debugadapter__/threads.lua")
local dispatch = require("__debugadapter__/dispatch.lua")
local variables = require("__debugadapter__/variables.lua")
local evaluate = require("__debugadapter__/evaluate.lua")
local DAprint = require("__debugadapter__/print.lua")

local env = _ENV
local _ENV = nil

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
    if i < (DAConfig.runningBreak or 5000) then
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
---@return hookmask mask
---@return number count
local function hook_rate(source)
  if not source or step_enabled or filebreaks(source) then
    if step_instr then
      return "cr", 1
    else
      return "clr", (DAConfig.runningBreak or 5000)
    end
  end
  return "cr", (DAConfig.runningBreak or 5000)
end

---@type table<string,true>
local isDumpIgnore = {}

--- Disable dumping (disassmbly, breakpoint location validation) for a file or list of files
---@param source string|string[] exact source name, e.g. `"@__modname__/file.lua"`
function DAstep.__pub.dumpIgnore(source)
  local tsource = type(source)
  if tsource == "string" then
    isDumpIgnore[source] = true
  elseif tsource == "table" then
    for _, asource in pairs(source) do
      isDumpIgnore[asource] = true
    end
  end
end

---@type boolean?
local blockhook
---@type {[function]:true}
local unhooked = setmetatable({}, {__mode = "k"})

--- wrap a function with disabling hooks
---@generic F : function
---@param f F
---@return F
function DAstep.unhook(f)
  if unhooked[f] then return f end
  local oldblock
  local function rehook(...)
    blockhook = oldblock
    return ...
  end
  local function unhook(...)
    oldblock = blockhook
    blockhook = true
    return rehook(f(...))
  end
  unhooked[unhook] = true
  unhooked[rehook] = true
  return unhook
end

local skip_ret_out = {}
local hook
do
  --- report a new `Source` event on entry to a main chunk
  ---@param info debuginfo
  local function sourceEvent(info)
    local s = normalizeLuaSource(info.source)
    local dasource
    if s == "=(dostring)" then
      dasource = variables.sourceRef(info.source)
    elseif ssub(s,1,1) == "@" then
      dasource = { name = s, path = "\xEF\xB7\x91"..s }
    end

    if dasource then
      local dump
      if not isDumpIgnore[s] then
        local rawdump = sdump(info.func)
        dump = variables.buffer(rawdump)
      end
      json_event_prompt{event="source", body={ source = dasource, dump = dump }}
      debugprompt() -- get breakpoint updates if needed
    end
  end

  ---@param source string
  local function bp_hook(source)
    dsethook(hook,hook_rate(source))
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
      catch when top=isapi
        (filter=unhandled does call in pCallWithStackTraceMessageHandler instead)
    out
      call * -> isapi
      return none <- *
      return isapi <- *
      catch unhandled
        (blocks ret out pCallWithStackTraceMessageHandler)

  catch:
    unhandled: unwind stepdepth to entrypoint, or 0
    else: unwind stepdept to rawxpcal +
]]

  ---debug hook function
  ---@param event string
  function hook(event)
    if blockhook then return end
    local info = dgetinfo(2,"Slfu")
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
              local success,conditionResult = evaluate.evaluateInternal(frameId,nil,"breakpoint",b.condition)
              if success and (not conditionResult) then
                isHit = false
              end
            end

            if isHit and b.hitCondition then -- only counts if condition was true
              b.hits = (b.hits or 0) + 1
              local success,hitResult = evaluate.evaluateInternal(frameId,nil,"breakpoint",b.hitCondition)
              if success and type(hitResult) == "number" and b.hits < hitResult then
                isHit = false
              end
            end

            if isHit then
              if b.logMessage then
                -- parse and print logMessage as an expression in the scope of the breakpoint
                local result,exprs = evaluate.stringInterp(b.logMessage,frameId,nil,"logpoint")
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


      local parent = dgetinfo(3,"Slu")
      if rawscript and step_enabled then
        local info_is_api = info.what=="C" and info.nups > 0
        local parent_is_none_or_api = not parent or (parent.what=="C" and parent.nups > 0)
        if info_is_api then
          dispatch.setStepping(stepdepth, step_instr)
          DAstep.__dap.step(nil)
        elseif parent_is_none_or_api then
          DAstep.__dap.step(dispatch.getStepping())
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
          k,v = dgetlocal(2,i)
        until not k or k == "noise_expression_metatable"
        if v then
          require("__debugadapter__/noise.lua")(v)
          DAprint.print("installed noise expression hook", nil, nil, "console")
        else
          DAprint.print("failed to install noise expression hook", nil, nil, "console")
        end
      end

      local parent = dgetinfo(3,"Slu")
      if rawscript and step_enabled then
        local info_is_api = info.what=="C" and info.nups > 0
        local parent_is_none_or_api = not parent or (parent.what=="C" and parent.nups > 0)
        if info_is_api then
          DAstep.__dap.step(dispatch.getStepping())
        elseif parent_is_none_or_api then
          local skip = skip_ret_out[info.func]
          skip_ret_out[info.func] = nil
          if not skip then
            dispatch.setStepping(stepdepth, step_instr)
            DAstep.__dap.step(nil)
          end
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
    local ref,err = variables.translate(mesg)
    mesg = ref or ("<"..err..">")
  end

  json_event_prompt{event="exception", body={
    threadId = threads.this_thread,
    filter = etype,
    mesg = mesg,
    }}
end

local on_exception

local apihooks = {}
function DAstep.attach()
  blockhook = true
  dsethook(hook,hook_rate())
  for k, v in pairs(apihooks) do
    rawset(env, k, v)
  end
  -- on_error is api for instrument mods to catch errors
  if env.on_error then
    env.on_error(on_exception)
  end
  blockhook = false
end
unhooked[DAstep.attach] = true

---@param source string
---@param breaks? DebugProtocol.SourceBreakpoint[]
dispatch.__inner.setBreakpoints = DAstep.unhook(function(source,breaks)
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
end)

---@param change string
function DAstep.__dap.updateBreakpoints(change)
  local source,changedbreaks = ReadBreakpoints(change)
  if source then
    dispatch.callAll("setBreakpoints", source, changedbreaks)
  end
end

---@param depth? number
---@param instruction? boolean
function DAstep.__dap.step(depth,instruction)
  if depth and stepdepth then
    print(sformat("step %d with existing depth! %d",depth,stepdepth))
  end
  stepdepth = depth
  step_instr = instruction
end

function DAstep.__dap.step_enabled(state)
  if step_enabled == state then return end
  dispatch.callAll("step_enabled", state)
end

function dispatch.__inner.step_enabled(state)
  step_enabled = state
end
unhooked[dispatch.__inner.step_enabled] = true

---Generate a breakpoint or exception from mod code
---@param mesg string|LocalisedString|nil
---@public
function DAstep.__pub.breakpoint(mesg)
  local oldblock = blockhook
  blockhook = true
  if mesg then
    print_exception("manual",mesg)
  else
    json_event_prompt{event="stopped", body={
      reason = "breakpoint",
      threadId = threads.this_thread,
      }}
  end
  debugprompt()
  blockhook = oldblock
end
unhooked[DAstep.__pub.breakpoint] = true

---Terminate a debug session from mod code
---@public
function DAstep.__pub.terminate()
  blockhook = true
  dsethook()
  print("\xEF\xB7\x90\xEE\x80\x8C")
  debugprompt()
end
unhooked[DAstep.__pub.terminate] = true

---Generate handlers for pcall/xpcall wrappers
---@param filter string Where the exception was intercepted
---@param user_handler? function When used as xpcall, the exception will pass to this handler after continuing
---@return function
---@package
local function caught(filter, user_handler)
  ---xpcall handler for intercepting pcall/xpcall
  ---@param mesg string|LocalisedString
  ---@return string|LocalisedString mesg
  local function _caught(mesg)
    local oldblock = blockhook
    blockhook = true

    local info = dgetinfo(filter=="unhandled" and 3 or 2, "Su")
    if rawscript and step_enabled then
      local top_is_api = info.what=="C" and info.nups > 0
      -- unhandled already got a `call in` on pCallWithStackTraceMessageHandler
      if top_is_api and filter~="unhandled" then
        print("catch in "..rawscript.mod_name.." "..filter)
        DAstep.__dap.step(dispatch.getStepping())
      end
    end

    -- if we were stepping over/out, adjust the depth for what's about
    -- to get dropped by the throw...
    if stepdepth and stepdepth >= 0 then
      local was = stepdepth
      -- +1 for a user_handler, since our call is blocked
      -- and the tailcall won't count
      if user_handler then
        stepdepth = stepdepth + 1
      end
      -- then subtract one for every level up to...
      if filter=="unhandled" then
        -- one for pCallWithStackTraceMessageHandler
        stepdepth = stepdepth - 1
        -- and try to find the entrypoint...
        local i = 3
        local func = dgetinfo(i, "ft")
        while func do
          stepdepth = stepdepth - 1
          -- a known entrypoint
          if DAstep.getEntryLabel(func.func) then break end
          -- a tailcall with parent is_api (likely re-entrant stack + entrypoint tailcalled)
          if func.istailcall then
            local parent = dgetinfo(i+1, "Su")
            if parent.what == "C" and parent.nups > 0 then
              break
            end
          end
          i = i + 1
          func = dgetinfo(i, "f")
        end

      else
        -- count to rawxpcall
        local i = 2
        local func = dgetinfo(i, "f")
        while func do
          if func.func == rawxpcall then break end
          i = i + 1
          stepdepth = stepdepth - 1
          func = dgetinfo(i, "f")
        end
      end
    end

    -- vscode might not want this, in which case it'll continue immediately,
    -- leaving the existing stepping state...
    print_exception(filter,mesg)
    debugprompt()

    if rawscript and step_enabled and filter=="unhandled" then
      -- unhandled gets a `return out` on pCallWithStackTraceMessageHandler
      skip_ret_out[dgetinfo(2).func]=true
      dispatch.setStepping(stepdepth, step_instr)
      DAstep.__dap.step(nil)
    end

    -- re-hook *before* calling user_handler
    -- tailcall so it's where it expects to be on the stack
    blockhook = oldblock
    if user_handler then
      return user_handler(mesg)
    elseif filter=="unhandled" then
      -- no return at all for unhandled, it will preserve the message anyway
      return
    else
      return mesg
    end
  end
  unhooked[_caught] = true
  return _caught
end
unhooked[caught] = true

if DAConfig.instrument then
  on_exception = caught("unhandled")
  -- shared for stack trace to know to skip one extra
  DAstep.on_exception = on_exception
  unhooked[on_exception] = true
end

---`pcall` replacement to redirect the exception to display in the editor
---@param func function
---@param ... any
---@return boolean success
---@return any result
---@return ...
function apihooks.pcall(func,...)
  return rawxpcall(func, caught("pcall"), ...)
end
stepIgnore(apihooks.pcall)

---`xpcall` replacement to redirect the exception to display in the editor
---@param func function
---@param user_handler function
---@param ... any
---@return boolean success
---@return any result
---@return ...
function apihooks.xpcall(func, user_handler, ...)
  return rawxpcall(func, caught("xpcall",user_handler), ...)
end
stepIgnore(apihooks.xpcall)

-- don't need the rest in data stage...
if rawscript then

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
          return "remote "..name.."::"..fname
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

  apihooks.script = {
    __raw = rawscript
  }

  ---Simulate an event being raised in the target mod ("level" for the scenario).
  ---Event data is not validated in any way.
  ---@param event defines.events|number|string
  ---@param data EventData
  ---@param modname string
  ---@public
  DAstep.__pub.raise_event = DAstep.unhook(function(event,data,modname)
    if not dispatch.callMod(modname, "raise_event", event, data) then
      error("cannot raise events here")
    end
  end)

  ---@param event defines.events|number|string
  ---@param data EventData
  ---@return ...
  function dispatch.__inner.raise_event(event,data)
    local f = event_handler[event]
    if f then
      return f(data)
    end
  end

  ---@param f? function
  function apihooks.script.on_init(f)
    rawscript.on_init(labelhandler(f,"on_init handler"))
  end
  apihooks.script.on_init()

  ---@param f? function
  function apihooks.script.on_load(f)
    rawscript.on_load(labelhandler(f,"on_load handler"))
  end
  apihooks.script.on_load()

  ---@param f? function
  function apihooks.script.on_configuration_changed(f)
    rawscript.on_configuration_changed(labelhandler(f,"on_configuration_changed handler"))
  end

  ---@param tick uint|uint[]|nil
  ---@param f fun(x:NthTickEventData)|nil
  ---@overload fun(x:nil)
  function apihooks.script.on_nth_tick(tick,f)
    if not tick then
      if f then
        -- pass this through for the error...
        return rawscript.on_nth_tick(tick,f)
      else
        -- just in case somebody gives me a `false`...
        return rawscript.on_nth_tick(tick)
      end
    else
      local ttype = type(tick)
      if ttype == "number" then
        return rawscript.on_nth_tick(tick,labelhandler(f,sformat("on_nth_tick %d handler",tick)))
      elseif ttype == "table" then
        return rawscript.on_nth_tick(tick,labelhandler(f,sformat("on_nth_tick {%s} handler",tconcat(tick,","))))
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
  local function on_event(event,f,...)
    -- on_event checks arg count and throws if event is table and filters is present, even if filters is nil
    local etype = type(event)
    ---@type boolean
    local has_filters = select("#",...)  > 0
    if etype == "number" then ---@cast event defines.events
      local evtname = sformat("event %d",event)
      for k,v in pairs(defines.events) do
        if event == v then
          ---@type string
          evtname = k
          break
        end
      end
      return rawscript.on_event(event,labelhandler(save_event_handler(event,f), sformat("%s handler",evtname)),...)
    elseif etype == "string" then
      if has_filters then
        error("Filters can only be used when registering single events.",2)
      end
      return rawscript.on_event(event,labelhandler(save_event_handler(event,f), sformat("%s handler",event)))
    elseif etype == "table" then
      if has_filters then
        error("Filters can only be used when registering single events.",2)
      end
      for _,e in pairs(event) do
        on_event(e,f)
      end
    else
      error({"","Invalid Event type ",etype},2)
    end
  end
  apihooks.script.on_event = on_event

  ---@type metatable_debug
  local newscriptmeta = {
    __index = rawscript,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) rawscript[k] = v end,
    __debugline = "<LuaBootstrap Debug Proxy>",
    __debugtype = "DebugAdapter.LuaBootstrap",
  }
  setmetatable(apihooks.script, newscriptmeta)

  local rawcommands = env.commands
  apihooks.commands = {
    __raw = rawcommands,
  }

  ---@param name string
  ---@param help string|LocalisedString
  ---@param f function
  function apihooks.commands.add_command(name,help,f)
    return rawcommands.add_command(name,help,labelhandler(f, "command /" .. name))
  end

  ---@param name string
  function apihooks.commands.remove_command(name)
    labelhandler(nil, "command /" .. name)
    return rawcommands.remove_command(name)
  end

  ---@type metatable_debug
  local newcommandsmeta = {
    __index = rawcommands,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) rawcommands[k] = v end,
    __debugline = "<LuaCommandProcessor Debug Proxy>",
    __debugtype = "DebugAdapter.LuaCommandProcessor",
  }
  setmetatable(apihooks.commands, newcommandsmeta)

  local rawremote = env.remote
  apihooks.remote = {
    __raw = rawremote,
  }

  ---@param remotename string
  ---@param funcs table<string,function>
  function apihooks.remote.add_interface(remotename,funcs)
    myRemotes[remotename] = funcs
    for name, func in pairs(funcs) do
      if type(func) == "function" then
        local info = dgetinfo(func, "S")
        if info and info.what == "C" then
          DAprint.print("remote "..remotename.."::"..name.." is a cfunction! thrown error locations may be incorrect.",
            nil, 2, "console")
        end
      end
    end
    return rawremote.add_interface(remotename,funcs)
  end

  ---@param remotename string
  function apihooks.remote.remove_interface(remotename)
    myRemotes[remotename] = nil
    return rawremote.remove_interface(remotename)
  end

  ---@type metatable_debug
  local remotemeta = {
    __index = rawremote,
    ---@param t table
    ---@param k any
    ---@param v any
    __newindex = function(t,k,v) rawremote[k] = v end,
    __debugline = "<LuaRemote Debug Proxy>",
    __debugtype = "DebugAdapter.LuaRemote",
    __debugcontents = function()
      return nextuple, {
        ["interfaces"] = {rawremote.interfaces},
        ["<raw>"] = {rawremote, {rawName = true, virtual = true}},
        ["<myRemotes>"] = {myRemotes, {rawName = true, virtual = true}},
      }
    end,
  }
  setmetatable(apihooks.remote, remotemeta)
end

---@type metatable_debug
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
return setmetatable(DAstep,vmeta)