local __DebugAdapter = __DebugAdapter
local string = string
local sformat = string.format
local ssub = string.sub
local smatch = string.match

local levelpath
if script and script.mod_name == "level" then
  ---@param modname string
  ---@param basepath string
  function __DebugAdapter.levelPath(modname,basepath)
    levelpath = {
      modname = modname,
      basepath = basepath,
    }
  end
end

local mods = mods -- capture mods in datastage, or fill in game.active_mods later for control...
                  -- TODO: `or script.active_mods` in 0.18
pcall(function() mods = script.active_mods end)
local knownSources = {}

---@param source string
---@return string
local function normalizeLuaSource(source)
  local first = ssub(source,1,1)
  if first == "=" then return source end
  if first ~= "@" then return "=(dostring)" end
  local known = knownSources[source]
  if known then return known end
  local smatch = smatch
  local modname,filename = smatch(source,"__(.+)__/(.+)")
  if not modname then
    --startup tracing sometimes gives absolute path of the scenario script, turn it back into the usual form...
    filename = smatch(source,"currently%-playing/(.+)")
    if filename then
    modname = "level"
    end
  end
  -- scenario scripts may provide hints to where they came from...
  -- cross-mod require doesn't allow __level__ so these can only ever be
  -- seen within the `level` modstate, where the hint will be visible
  if modname == "level" then
    if levelpath then
    modname = levelpath.modname
    filename = levelpath.basepath .. filename
    end
  end

  if modname == "level" then
    -- we *still* can't identify level properly, so just give up...
    local result = sformat("LEVEL/%s",filename)
    knownSources[source] = result
    return result
  elseif modname == "core" or modname == "base" then
    -- these are under data path with no version in dir name
    local result = sformat("DATA/%s/%s",modname,filename)
    knownSources[source] = result
    return result
  elseif modname == nil then
    --something totally unrecognized?
    knownSources[source] = source
    return source
  else
    -- we found it! This will be a path relative to the `mods` directory.
    if not mods then mods = game.active_mods end --TODO: script.active_mods in 0.18, allow stepping before `game`
    local modver = mods[modname]
    local result = sformat("MOD/%s_%s/%s",modname,modver,filename)
    knownSources[source] = result
    return result
  end
end
__DebugAdapter.stepIgnore(normalizeLuaSource)
return normalizeLuaSource