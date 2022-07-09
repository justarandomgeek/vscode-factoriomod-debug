---@class Profiler
---@field trackFuncs? boolean
---@field trackLines? boolean
---@field trackTree? boolean
__Profiler = __Profiler or {}
local __Profiler = __Profiler

local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local print = print
---@type fun(ls:LocalisedString)
local localised_print = localised_print
local debug = debug
local mod_name = script.mod_name
local pairs = pairs

---@type fun(stopped?:boolean):LuaProfiler
local create_profiler
do
  local validLuaObjectTypes = {table=true,userdata=true}
  local reg = debug.getregistry()
  local dgetmetatable = debug.getmetatable
  local type = type
  function create_profiler(stopped)
    do
      local game = game
      if game then -- everywhere but main chunk or on_load
        create_profiler = game.create_profiler
        return create_profiler(stopped)
      end
    end

    -- it's in the registery for on_load, but with whatever ref id was free
    -- find it by its metatable, since that has a name on it at least...
    -- DON'T DO THIS! THIS IS A HORRIBLE HACK!
    local gmt = reg["LuaGameScript"]
    if gmt then -- but it's not there when instruments first run
      for _,t in pairs(reg) do
        if validLuaObjectTypes[type(t)] and dgetmetatable(t)==gmt then
          create_profiler = t.create_profiler
          return create_profiler(stopped)
        end
      end
    end
  end
end

---@class TimeAndCount
---@field count number
---@field timer Accumulator

---@type Accumulator|nil Total time accumulated in this lua state
local luatotal
---@type table<string,table<number,TimeAndCount>> Time accumulated per line
local linedata = {}
---@type table<string,table<number,TimeAndCount>> Time accumulated per function
local funcdata = {}

if not __Profiler.slowStart then
  __Profiler.slowStart = 0
end
if not __Profiler.updateRate then
  __Profiler.updateRate = 500
end

---@class Accumulator
---@field timer LuaProfiler
---@field add fun(other:LuaProfiler)

---@return Accumulator
local function getaccumulator()
  -- start stopped, prefetch add to skip __index while accumulating in hook
  local timer = create_profiler(true)
  -- prefetch these to skip __index for the hook later
  return {
    timer = timer,
    add = timer.add,
  }
end


---@param file string
---@param line number
---@return Accumulator
local function getlinetimer(file,line)
  local f = linedata[file]
  if not f then
    f = {}
    linedata[file] = f
  end

  local ld = f[line]
  if not ld then
    ld = {count=0}
    f[line] = ld
    ld.timer = getaccumulator()
  end
  ld.count = ld.count + 1
  return ld.timer
end

---@param file string
---@param line number
---@return Accumulator
local function getfunctimer(file,line)
  -- line data needs file for dumps to work
  if not linedata[file] then linedata[file] = {} end

  local f = funcdata[file]
  if not f then
    f = {}
    funcdata[file] = f
  end

  local fd = f[line]
  if not fd then
    fd = {count=0}
    f[line] = fd
    fd.timer = getaccumulator()
  end
  fd.count = fd.count + 1
  return fd.timer
end

---@type number
local dumpcount = 0
---@type boolean|nil
local dumpnow

---@class HookTimer time not yet accumulated to specific line/function timer(s)
---@field stop fun()
---@field reset fun()
---@field timer LuaProfiler

---@type HookTimer|nil
local hooktimer
---@type Accumulator|nil the timer for the current line, if any
local activeline
-- the timers for lines higher up the callstack, if any
local callstack = {}
-- timer tree for flamegraph

---@type flamenode
local calltree = {
  root = true,
  children = {}
}

---@class flamenode
---@field root boolean if this node is the root of the tree - will not include other fields except `children`
---@field funcname string names this fun is called by
---@field filename string the file this function is defined in
---@field line number the line this function is defined at
---@field timer Accumulator the time in this function
---@field children table<string,flamenode> nodes for functions called by this function

---@param tree flamenode
local function dumptree(tree)
  if tree.root then
    print("PROOT:")
  else
    localised_print{"","PTREE:",tree.funcname,":",tree.filename,":",tree.line,":",tree.timer.timer}
  end
  ---@type flamenode
  for _,node in pairs(tree.children) do
    dumptree(node)
  end
  print("PTEND:")
end


---@param treenode flamenode
---@param source string
---@param linedefined integer
---@param name string|nil
---@return flamenode
local function getstackbranch(treenode,source,linedefined,name)
  ---@type string
  local fname = (name or '(anon)')
  local childindex = fname..":"..source..":"..linedefined
  local child = treenode.children[childindex]
  if child then
    return child
  else
    ---@type flamenode
    child = {
      name = childindex,
      funcname = fname, filename = source, line = linedefined,
      timer = getaccumulator(),
      children = {}
    }
    treenode.children[childindex] = child
    return child
  end
end

local function accumulate_hook_time()
  if not hooktimer then
    return
  end
  local ht = hooktimer.timer

  if not luatotal then
    luatotal = getaccumulator()
  end
  luatotal.add(ht)
  if activeline then
    activeline.add(ht)
  end
  for _,stackframe in pairs(callstack) do
    local linetimer = stackframe.linetimer
    if linetimer then
      linetimer.add(ht)
    end
    local functimer = stackframe.functimer
    if functimer then
      functimer.add(ht)
    end
    --stack timers
    local stacknode = stackframe.node
    if stacknode then
      stacknode.timer.add(ht)
    end
  end
end

local hook
local attach
local detach

local function dump()
  detach()
  local t = create_profiler()
  print("***DebugAdapterBlockPrint***\nPROFILE:")
  -- reuse one table lots to be nice to GC
  ---@type LocalisedString
  local tag = {"","PMN:",mod_name,":",luatotal and luatotal.timer}
  localised_print(tag)
  luatotal = nil
  for file,f in pairs(linedata) do
    print("PFN:"..file)
    tag[2] = "PLN:"
    tag[6] = ":"
    for line,ld in pairs(f) do
      tag[3] = line
      tag[5] = ld.timer.timer
      tag[7] = ld.count
      localised_print(tag)
    end
    local fd = funcdata[file]
    if fd then
      tag[2] = "PFT:"
      for line,ft in pairs(fd) do
        tag[3] = line
        tag[5] = ft.timer.timer
        tag[7] = ft.count
        localised_print(tag)
      end
    end
  end

  -- walk calltree
  dumptree(calltree)

  t.stop()
  localised_print{"","POV:",t}
  print("***EndDebugAdapterBlockPrint***")
  linedata = {}
  funcdata = {}
  activeline = nil
  for _,frame in pairs(callstack) do
    frame.linetimer = nil
    frame.functimer = nil
    frame.node = nil
  end
  hooktimer = nil
  calltree = { root = true, children = {} }
  attach()
end

do
  local getinfo = debug.getinfo
  local sub = string.sub
  ---@param event string
  ---@param line number
  function hook(event,line)
    if hooktimer then
      hooktimer.stop()
    else
      local timer = create_profiler(true)
      if not timer then return end

      -- prefetch these to skip __index for the hook later
      hooktimer = {
        timer = timer,
        stop = timer.stop,
        reset = timer.reset,
      }
    end
    accumulate_hook_time()
    if event == "line" then
      local info = getinfo(2,"S") -- currently executing function
      local s = info.source
      if sub(s,1,1) == "@" then
        s = normalizeLuaSource(s)
        activeline = getlinetimer(s,line)
      else
        activeline = nil
      end
    elseif event == "call" or event == "tail call" then
      local info = getinfo(2,"nS") -- call target
      local s = info.source
      local functimer
      if (__Profiler.trackFuncs ~= false) then
        if sub(s,1,1) == "@" then
          s = normalizeLuaSource(s)
          functimer = getfunctimer(s,info.linedefined)
        end
      end
      local top = #callstack
      local node
      if (__Profiler.trackTree ~= false) then
        if top == 0 then
          node = calltree
        else
          node = callstack[top].node
        end
        if node then
          node = getstackbranch(node,s,info.linedefined,info.name)
        end
      end
      -- push activeline to callstack
      callstack[top+1] = {
        linetimer = activeline,
        functimer = functimer,
        node = node,
        tail= event=="tail call",
      }
      activeline = nil
    elseif event == "return" then
      -- pop from callstack until not tail, return to activeline
      for i = #callstack,1,-1 do
        local stackframe = callstack[i]
        callstack[i] = nil
        if not stackframe.tail then
          activeline = stackframe.linetimer
          break
        end
      end

      -- make sure to stop counting when we exit lua
      local parent = getinfo(3,"f") -- returning to
      if not parent then
        local info = getinfo(2,"S") -- returning from
        -- top of stack
        if info.what == "main" or info.what == "Lua" then
          dumpcount = dumpcount + 1
          if dumpcount < __Profiler.slowStart or
            dumpcount % __Profiler.updateRate == 0 or
            dumpnow
            then
            dump()
            dumpnow = nil
          end
        end
      end
    end
    if hooktimer then
      return hooktimer.reset()
    end
  end
end
function attach()
  debug.sethook(hook, (__Profiler.trackLines ~= false) and "clr" or "cr")
end

function detach()
  debug.sethook()
end

if mod_name ~= "debugadapter" then -- don't hook myself!
  remote.add_interface("__profiler_" .. mod_name ,{
    dump = function()
      dumpnow = true
    end,
    slow = function()
      dumpcount = 0
      dumpnow = true
    end,
  })
  log("profiler registered for " .. mod_name)
  attach()
end