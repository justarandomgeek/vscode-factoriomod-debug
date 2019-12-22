local levelpath
if script.mod_name == "level" then
  ---@param modname string
  ---@param basepath string
  function __DebugAdapter.levelPath(modname,basepath)
    levelpath = {
      modname = modname,
      basepath = basepath,
    }
  end
  __DebugAdapter.stepIgnore(__DebugAdapter.levelPath)
end

---@param source string
---@return string
local function normalizeLuaSource(source)
  local first = source:sub(1,1)
  if first == "=" then return source end
  if first ~= "@" then return "=(dostring)" end
  local modname,filename = source:match("__(.+)__/(.+)")
  if not modname then
    --startup tracing sometimes gives absolute path of the scenario script, turn it back into the usual form...
    filename = source:match("currently%-playing/(.+)")
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
    return string.format("LEVEL/%s",filename)
  elseif modname == "core" or modname == "base" then
    -- these are under data path with no version in dir name
    return string.format("DATA/%s/%s",modname,filename)
  elseif modname == nil then
    --something totally unrecognized?
    return source
  else
    -- we found it! This will be a path relative to the `mods` directory.
    local modver = game.active_mods[modname] --TODO: script.active_mods in 0.18, allow stepping before `game`
    return string.format("MOD/%s_%s/%s",modname,modver,filename)
  end
end
__DebugAdapter.stepIgnore(normalizeLuaSource)
return normalizeLuaSource