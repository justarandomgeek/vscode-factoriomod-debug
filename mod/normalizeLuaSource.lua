local __DebugAdapter = __DebugAdapter
local string = string
local ssub = string.sub
local smatch = string.match
local pcall = pcall

---@type {modname:string, basepath:string}
local levelpath
if script and script.mod_name == "level" then
  local level = script.level
  if level.is_tutorial then
    levelpath = {
      modname = "base",
      basepath = "tutorials/"..level.level_name.."/",
    }
  elseif level.campaign_name then
    levelpath = {
      modname = level.mod_name or "#user",
      basepath = "campaigns/"..level.campaign_name.."/"..level.level_name.."/",
    }
  else
    levelpath = {
      modname = level.mod_name or "#user",
      basepath = "scenarios/"..level.level_name.."/",
    }
  end

  ---@param modname string
  ---@param basepath string
  function levelPath(modname,basepath)
    __DebugAdapter.print("__DebugAdapter.levelPath is no longer needed",nil,2,"stderr")
  end
  if __DebugAdapter then __DebugAdapter.levelPath = levelPath end
  if __Profiler then __Profiler.levelPath = levelPath end
end

---@type {[string]:string}
local knownSources = {}

---@param source string
---@return string
local function normalizeLuaSource(source)
  if source == "?" then return "=(unknown)" end
  local first = ssub(source,1,1)
  if first == "=" then return source end
  if first ~= "@" then return "=(dostring)" end
  ---@type string|nil
  local known = knownSources[source]
  if known then return known end
  local filename =
    smatch(source,"__level__/(.+)") or
    --main scenario script gets absolute path, check for those too...
    smatch(source,"currently%-playing/(.+)") or
    smatch(source,"currently%-playing%-background/(.+)") or
    smatch(source,"currently%-playing%-tutorial/(.+)")
  if not filename then
    -- still not a scenario file, just return it as-is
    knownSources[source] = source
    return source
  end

  -- scenario scripts may provide hints to where they came from...
  -- cross-mod require doesn't allow __level__ so these can only ever be
  -- seen within the `level` modstate, where the hint will be visible
  if levelpath then
    filename = "@__"..levelpath.modname.."__/"..levelpath.basepath..filename
    knownSources[source] = filename
    return filename
  end

  -- unhinted scenario script
  -- don't save this so that a level hint later can update it!
  --knownSources[source] = source
  return source
end

if __DebugAdapter then
  __DebugAdapter.stepIgnore(normalizeLuaSource)
end
return normalizeLuaSource