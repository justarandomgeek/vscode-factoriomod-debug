local script = (type(script)=="table" and rawget(script,"__raw")) or script
local string = string
local ssub = string.sub
local smatch = string.match

---@type string
local levelpath
if script and script.mod_name == "level" then
  local level = script.level
  if level.is_tutorial then
    levelpath = "@__base__/tutorials/"..level.level_name.."/"
  elseif level.campaign_name then
    levelpath = "@__"..(level.mod_name or "#user").."__/campaigns/"..level.campaign_name.."/"..level.level_name.."/"
  else
    levelpath =  "@__"..(level.mod_name or "#user").."__/scenarios/"..level.level_name.."/"
  end
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
  -- don't bother with any further fancy recognition unless we're actually in `level`...
  if not levelpath then return source end
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

  -- scenario scripts may have hints to where they came from...
  -- cross-mod require doesn't allow __level__ so these can only ever be
  -- seen within the `level` modstate, where the hint will be visible
  if levelpath then
    filename = levelpath..filename
    knownSources[source] = filename
    return filename
  end

  -- unhinted scenario script.
  -- this should never happen, but it won't get any better later,
  -- so save it anyway to skip re-parsing it...
  knownSources[source] = source
  return source
end

return normalizeLuaSource