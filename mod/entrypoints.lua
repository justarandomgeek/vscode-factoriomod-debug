local rawxpcall = xpcall
local debug = debug
local print = print
local localised_print = localised_print
local __DebugAdapter = __DebugAdapter
local setmetatable = setmetatable
local variables = require("__debugadapter__/variables.lua")

---Print an exception to the editor
---@param type string
---@param mesg string|LocalisedString|nil
local function print_exception(type,mesg)
  if mesg == nil then mesg = "<nil>" end
  localised_print({"",
  "***DebugAdapterBlockPrint***\n"..
  "DBG: exception ", type, "\n",
  mesg,"\n"..
  "***EndDebugAdapterBlockPrint***"
  })
end
__DebugAdapter.print_exception = print_exception

---Generate a breakpoint or exception from mod code
---@param mesg string|LocalisedString|nil
function __DebugAdapter.breakpoint(mesg)
  debug.sethook()
  if mesg then
    print_exception("manual",mesg)
  else
    print("DBG: breakpoint")
  end
  debug.debug()
  return __DebugAdapter.attach()
end

-- don't need the rest in data stage...
if not script then return end

---@type table<function,string>
local handlernames = setmetatable({},{__mode="k"})
---@type table<string,function>
local handlers = {}

---@type table<string,table<string,function>>
local myRemotes = {}

---Look up the label for an entrypoint function
---@param func function
---@return string label
function __DebugAdapter.getEntryLabel(func)
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
end

---Record a handler label for a function and return that functions
---@param func function
---@param entryname string
---@return function func
local function labelhandler(func,entryname)
  if func then
    if handlernames[func] then
      handlernames[func] = "(shared handler)"
    else
      handlernames[func] = entryname
    end
    do
      local oldhandler = handlers[entryname]
      if oldhandler and oldhandler ~= func then
        __DebugAdapter.print("Replacing existing {entryname} {oldhandler} with {func}",nil,3,"console",true)
      end
    end
  end
  handlers[entryname] = func
  return func
end
__DebugAdapter.stepIgnore(labelhandler)


---Generate handlers for pcall/xpcall wrappers
---@param filter string Where the exception was intercepted
---@param user_handler function When used as xpcall, the exception will pass to this handler after continuing
---@return function
local function caught(filter, user_handler)
  ---xpcall handler for intercepting pcall/xpcall
  ---@param mesg string|LocalisedString
  ---@return string|LocalisedString mesg
  return __DebugAdapter.stepIgnore(function(mesg)
    debug.sethook()
    print_exception(filter,mesg)
    debug.debug()
    __DebugAdapter.attach()
    if user_handler then
      return user_handler(mesg)
    else
      return mesg
    end
  end)
end
__DebugAdapter.stepIgnore(caught)

---`pcall` replacement to redirect the exception to display in the editor
---@param func function
---@vararg any
---@return boolean success
---@return any result
---@return ...
function pcall(func,...)
  return rawxpcall(func, caught("pcall"), ...)
end
__DebugAdapter.stepIgnore(pcall)

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
__DebugAdapter.stepIgnore(xpcall)

local oldscript = script
local newscript = {
  __raw = oldscript
}

---@param f function
function newscript.on_init(f)
  oldscript.on_init(labelhandler(f,"on_init handler"))
end
newscript.on_init()

---@param f function
function newscript.on_load(f)
  oldscript.on_load(labelhandler(f,"on_load handler"))
end
newscript.on_load()

---@param f function
function newscript.on_configuration_changed(f)
  return oldscript.on_configuration_changed(labelhandler(f,"on_configuration_changed handler"))
end

---@param tick number
---@param f function
function newscript.on_nth_tick(tick,f)
  if not tick then
    return oldscript.on_nth_tick(nil)
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

---@param event number|string|table
---@param f function
---@param filters table
function newscript.on_event(event,f,filters)
  -- on_event checks arg count and throws if event is table and filters is present, even if filters is nil
  local etype = type(event)
  if etype == "number" then
    local evtname = ("event %d"):format(event)
    for k,v in pairs(defines.events) do
      if event == v then
        ---@type string
        evtname = k
        break
      end
    end
    return oldscript.on_event(event,labelhandler(f, ("%s handler"):format(evtname)),filters)
  elseif etype == "string" then
    if filters then
      error("Filters can only be used when registering single events.",2)
    end
    return oldscript.on_event(event,labelhandler(f, ("%s handler"):format(event)))
  elseif etype == "table" then
    if filters then
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
__DebugAdapter.stepIgnoreAll(newscript)
__DebugAdapter.stepIgnoreAll(newscriptmeta)
setmetatable(newscript,newscriptmeta)

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
__DebugAdapter.stepIgnoreAll(newcommands)
__DebugAdapter.stepIgnoreAll(newcommandsmeta)
setmetatable(newcommands,newcommandsmeta)

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
  __debugchildren = function()
    return {
      variables.create([["interfaces"]],oldremote.interfaces),
      variables.create("<raw>",oldremote),
      {
        name = "<myRemotes>",
        value = "<myRemotes>",
        type = "table",
        variablesReference = variables.tableRef(myRemotes),
      },
    }
  end,
}
__DebugAdapter.stepIgnoreAll(newremote)
__DebugAdapter.stepIgnoreAll(remotemeta)
setmetatable(newremote,remotemeta)

script = newscript
commands = newcommands
remote = newremote