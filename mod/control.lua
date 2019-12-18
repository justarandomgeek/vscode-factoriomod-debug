local function callAll(funcname,...)
  local results = {}
  for name,version in pairs(game.active_mods) do
    local remotename = "__debugadapter_" .. name
    if remote.interfaces[remotename] then
      results[name] = remote.call(remotename,funcname,...)
    end
  end
  if remote.interfaces["__debugadapter_level"] then
    results["level"] = remote.call("__debugadapter_level",funcname,...)
  end
  return results
end

local function attach()
  callAll("attach")
end

local function detach()
  callAll("detach")
end

local function updateBreakpoints(changedsources)
  for source,breakpoints in pairs(game.json_to_table(changedsources)) do
    callAll("setBreakpoints",source,breakpoints)
  end
  print("DBGsetbp")
end

local function modules()
  local modules = {}
  for name,version in pairs(game.active_mods) do
    modules[#modules+1] = {
      id = name, name = name,
      version = version,
    }
  end
  modules[#modules+1] = { id = "level", name = "level", }
  print("EVTmodules: " .. game.table_to_json(modules))
end

script.on_init(function()
  attach()
  modules()
  print("DBG: on_init")
  debug.debug()
end)

local attachOnFirstTick
script.on_load(function()
  attachOnFirstTick = true
  print("DBG: on_load")
  debug.debug()
end)

local firsttick = true
script.on_event(defines.events.on_tick,function()
  if attachOnFirstTick then attachOnFirstTick = false attach() end
  if firsttick then
    firsttick = false
    modules()
    print("DBG: on_first_tick")
    debug.debug()
  else
    print("DBG: on_tick")
    debug.debug()
  end
end)

remote.add_interface("debugadapter",{
  attach = attach,
  detach = detach,
  updateBreakpoints = updateBreakpoints,
})