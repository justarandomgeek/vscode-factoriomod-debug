local __DebugAdapter = __DebugAdapter
local string = string
local ssub = string.sub
local smatch = string.match
local pcall = pcall

local levelpath
if script and script.mod_name == "level" then
  ---@param modname string
  ---@param basepath string
  local function levelPath(modname,basepath)
    levelpath = {
      modname = modname,
      basepath = basepath,
    }
  end
  local success = pcall(function()
    local level = script.level -- will throw here if factorio doesn't support this yet
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

    function levelPath(modname,basepath)
      __DebugAdapter.print("__DebugAdapter.levelPath is no longer required",nil,2,"console")
    end
  end)
  if __DebugAdapter then __DebugAdapter.levelPath = levelPath end
  if __Profiler then __Profiler.levelPath = levelPath end
end

local knownSources = {}

---@param source string
---@return string
local function normalizeLuaSource(source)
  local first = ssub(source,1,1)
  if first == "=" then return source end
  if first ~= "@" then return "=(dostring)" end
  local known = knownSources[source]
  if known then return known end
  local filename = smatch(source,"__level__/(.+)")
  if not filename then
    --main scenario script gets absolute path, check for that too...
    filename = smatch(source,"currently%-playing/(.+)")
  end
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