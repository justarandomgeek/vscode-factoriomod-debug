local rawxpcall = xpcall
local debug = debug
local print = print
local localised_print = localised_print
local __DebugAdapter = __DebugAdapter
local setmetatable = setmetatable
local variables = require("__debugadapter__/variables.lua")

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

function __DebugAdapter.breakpoint(mesg)
  if mesg then
    print_exception("manual",mesg)
  else
    print("DBG: breakpoint")
  end
  debug.debug()
  return
end

-- don't need the rest in data stage...
if not script then return end

local handlernames = setmetatable({},{__mode="k"})
local myRemotes = {}

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
local function labelhandler(func,entryname)
  if func == nil then return nil end
  if handlernames[func] then
    handlernames[func] = "(shared handler)"
  else
    handlernames[func] = entryname
  end
  return func
end
__DebugAdapter.stepIgnore(labelhandler)

local function caught(filter, user_handler)
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

function pcall(func,...)
  return rawxpcall(func, caught("pcall"), ...)
end
__DebugAdapter.stepIgnore(pcall)
function xpcall(func, user_handler, ...)
  return rawxpcall(func, caught("xpcall",user_handler), ...)
end
__DebugAdapter.stepIgnore(xpcall)

local oldscript = script
local newscript = {
  __raw = oldscript
}

local registered_handlers = {}
local function check_events(f)
  if __DebugAdapter.checkEvents == false then
    return f
  end
  local de = defines.events
  local groups = {
    built = {
      [de.on_built_entity] = true,
      [de.on_robot_built_entity] = true,
      [de.script_raised_built] = true,
      [de.script_raised_revive] = true,
      [de.on_entity_cloned] = true,
    },

    destroyed = {
      [de.on_entity_died] = 1,
      [de.on_post_entity_died] = 1,

      [de.on_pre_chunk_deleted] = 2,
      [de.on_chunk_deleted] = 2,

      [de.on_pre_surface_cleared] = 3,
      [de.on_surface_cleared] = 3,

      [de.on_pre_surface_deleted] = 4,
      [de.on_surface_deleted] = 4,

      [de.on_pre_player_mined_item] = 5,
      [de.on_player_mined_entity] = 5,
      [de.on_player_mined_item] = 5,
      [de.on_player_mined_tile] = 5,

      [de.on_robot_pre_mined] = 6,
      [de.on_robot_mined] = 6,
      [de.on_robot_mined_entity] = 6,
      [de.on_robot_mined_tile] = 6,

      [de.script_raised_destroy] = true,
    }
  }
  return __DebugAdapter.stepIgnore(function()
    if f then f() end
    if next(registered_handlers) then
      for group,gevents in pairs(groups) do
        local foundany = false
        local notfound = {}
        local hassubgroup = {}
        for event,subgroup in pairs(gevents) do
          if registered_handlers[event] then
            foundany = true
            if subgroup ~= true then
              hassubgroup[subgroup] = true
            end
          else
            notfound[event] = subgroup
          end
        end
        for event,subgroup in pairs(notfound) do
          if hassubgroup[subgroup] then
            notfound[event] = nil
          end
        end
        if foundany and next(notfound) then
          local message = {"Mod Debugger Event Check: ", script.mod_name, " is listening for \"", group, "\" events but not"}
          local singles = {}
          local subgroups = {}
          for event,subgroup in pairs(notfound) do
            local eventname = tostring(event)
            for k,v in pairs(de) do
              if event == v then
                eventname = k
                break
              end
            end
            if subgroup == true then
              singles[#singles+1] = eventname
            else
              subgroups[subgroup] = subgroups[subgroup] or {}
              local sg = subgroups[subgroup]
              sg[#sg+1] = eventname
            end
          end
          if singles[1] then
            message[#message+1] = " "
            message[#message+1] = table.concat(singles,", ")
          end
          local submessages = {}
          for _,subgroup in pairs(subgroups) do
            submessages[#submessages+1] = "at least one of (" .. table.concat(subgroup,", ") .. ")"
          end
          if submessages[1] then
            if singles[1] then
              message[#message+1] = ", "
            else
              message[#message+1] = " "
            end
            message[#message+1] = table.concat(submessages,", ")
          end
          print(table.concat(message))
        end
      end
    end
  end)
end
__DebugAdapter.stepIgnore(check_events)

function newscript.on_init(f)
  oldscript.on_init(check_events(labelhandler(f,"on_init handler")))
end
newscript.on_init()

function newscript.on_load(f)
  oldscript.on_load(check_events(labelhandler(f,"on_load handler")))
end
newscript.on_load()

function newscript.on_configuration_changed(f)
  return oldscript.on_configuration_changed(labelhandler(f,"on_configuration_changed handler"))
end

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
    registered_handlers[event] = f
    return oldscript.on_event(event,labelhandler(f, ("%s handler"):format(evtname)),filters)
  elseif etype == "string" then
    registered_handlers[event] = f
    return oldscript.on_event(event,labelhandler(f, ("%s handler"):format(event)))
  elseif etype == "table" then
    for _,e in pairs(event) do
      newscript.on_event(e,f)
    end
  else
    error({"","Invalid Event type ",etype},2)
  end
end


local newscriptmeta = {
  __index = oldscript,
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

function newcommands.add_command(name,help,f)
  return oldcommands.add_command(name,help,labelhandler(f, "command /" .. name))
end

function newcommands.remove_command(name)
  return oldcommands.remove_command(name)
end

local newcommandsmeta = {
  __index = oldcommands,
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

function newremote.add_interface(remotename,funcs,...)
  myRemotes[remotename] = funcs
  return oldremote.add_interface(remotename,funcs,...)
end

function newremote.remove_interface(remotename,...)
  myRemotes[remotename] = nil
  return oldremote.remove_interface(remotename,...)
end

local remotemeta = {
  __index = oldremote,
  __newindex = function(t,k,v) oldremote[k] = v end,
  __debugline = "<LuaRemote Debug Proxy>",
  __debugtype = "DebugAdapter.LuaRemote",
  __debugchildren = function(t)
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