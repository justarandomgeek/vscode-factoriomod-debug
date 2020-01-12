local function on_exception(mesg)
  -- don't bother breaking when remotestepping rethrows an error, we've already had that one...
  local ex = mesg:match("^REMSTEP\n(.+)$")
  if ex then
    -- 0=traceback 1=on_exception 2=error (rethrow from hook) 3=remote.call hook 4=calling code to remote.call
    -- remove two lines -1=try_func or remoteCallInner, -2=xpcall
    return debug.traceback(ex,4):match("^(.+)\n[^\n]+\n[^\n]+$")
  else
    ex = mesg:match("^([^\n]+)")
    print("DBG: exception " .. ex)
    debug.debug()
    -- 0=traceback 1=on_exception 2=at exception
    -- remove two lines -1=try_func or remoteCallInner, -2=xpcall
    return debug.traceback(ex,2):match("^(.+)\n[^\n]+\n[^\n]+$")
  end
end
--shared for remotestepping
__DebugAdapter.on_exception = on_exception

local entrypoint = {}

function __DebugAdapter.getEntryPointName()
  return entrypoint[#entrypoint]
end
function __DebugAdapter.pushEntryPointName(entry)
  --print(script.mod_name .. " push " .. entry)
  entrypoint[#entrypoint+1] = entry
end
function __DebugAdapter.popEntryPointName()
  local entry = entrypoint[#entrypoint]
  --print(script.mod_name .. " pop " .. entry)
  entrypoint[#entrypoint] = nil
  return entry
end

local function try(func,entryname)
  if func == nil then return nil end
  local try_func = function(...)
    __DebugAdapter.pushEntryPointName(entryname)
    local success,message = xpcall(func,on_exception,...)
    if not success then
      -- factorio will add a new stacktrace below whatever i give it here, and there doesn't seem to be anything i can do about it.
      -- but i can rename it at least...
      local rethrow = error
      rethrow(message,-1)
    end
    __DebugAdapter.popEntryPointName()
  end
  __DebugAdapter.stepIgnore(try_func)
  return try_func
end
__DebugAdapter.stepIgnore(try)

local oldscript = script
local newscript = {
  __raw = oldscript
}

for name in pairs({on_init=true, on_load=true, on_configuration_changed=true}) do
  local oldfunc = oldscript[name]
  newscript[name] = function (f)
    return oldfunc(try(f,name .. " handler"))
  end
end

function newscript.on_nth_tick(tick,f)
  return oldscript.on_nth_tick(tick,try(f,("on_nth_tick %d handler"):format(tick)))
end

function newscript.on_event(event,f,filters)
  -- on_event checks arg count and throws if event is table and filters is present, even if filters is nil
  local etype = type(event)
  if etype == "number" then
    local evtname = ("event %d"):format(event)
    for k,v in pairs(defines.events) do
      if event == v then
        evtname = k
        break
      end
    end
    return oldscript.on_event(event,try(f, ("%s handler"):format(evtname)),filters)
  elseif etype == "string" then
    return oldscript.on_event(event,try(f, ("%s handler"):format(event)))
  elseif etype == "table" then
    for _,e in pairs(event) do
      newscript.on_event(e,f)
    end
  else
    error("Invalid Event type " .. etype,2)
  end
end

function newscript.raise_event(event,eventdata)
  -- factorio adds `mod_name`, so i don't need to
  eventdata.__debug = {
    stack = __DebugAdapter.stackTrace(-2, nil, true),
  }
  oldscript.raise_event(event,eventdata)
end

local newscriptmeta = {
  __index = oldscript,
  __newindex = function(t,k,v) oldscript[k] = v end,
  __debugline = "<LuaBootstrap Debug Proxy>",
}
__DebugAdapter.stepIgnoreAll(newscript)
__DebugAdapter.stepIgnoreAll(newscriptmeta)
setmetatable(newscript,newscriptmeta)

local oldcommands = commands
local newcommands = {
  __raw = oldcommands,
}

function newcommands.add_command(name,help,f)
  return oldcommands.add_command(name,help,try(f, "command /" .. name))
end

function newcommands.remove_command(name)
  return oldcommands.remove_command(name)
end

local newcommandsmeta = {
  __index = oldcommands,
  __newindex = function(t,k,v) oldcommands[k] = v end,
  __debugline = "<LuaCommandProcessor Debug Proxy>",
}
__DebugAdapter.stepIgnoreAll(newcommands)
__DebugAdapter.stepIgnoreAll(newcommandsmeta)
setmetatable(newcommands,newcommandsmeta)

if script.mod_name ~= "debugadapter" then -- don't hook myself!
  script = newscript
  commands = newcommands
end