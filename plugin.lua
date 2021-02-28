--##
---@class diff
---@field start  integer # The number of bytes at the beginning of the replacement
---@field finish integer # The number of bytes at the end of the replacement
---@field text   string  # What to replace

---@param  uri  string # The uri of file
---@param  text string # The content of file
---@return nil|diff[]
function OnSetText(uri, text)
  if text:sub(1, 4)=="--##" then return end

  local diffs = {}

  for start, name, finish in text:gmatch("require%s*%(?%s*['\"]()(.-)()['\"]%s*%)?") do
    -- if name has slashes, convert to a dotted path
    if name:match("[\\/]") then
      name = name:gsub("%.lua$",""):gsub("[\\/]",".")
    end

    -- then convert the modname prefix, if any...
    name = name:gsub("^__(.-)__", function(match)
      return match
    end)

    diffs[#diffs+1] = {
      start  = start,
      finish = finish - 1,
      text = name,
    }
  end

  -- rename `global` so we can tell them apart!
  local thismod = uri:match("mods[\\/]([^\\/]+)[\\/]")
  if thismod then
    local scenario = uri:match("scenarios[\\/]([^\\/]+)[\\/]")
    if scenario then
      thismod = thismod.."__"..scenario
    end
    thismod = thismod:gsub("[^a-zA-Z0-9_]","_")
    local gname = "__"..thismod.."__global"
    local replaced
    for start, finish in text:gmatch("[^a-zA-Z0-9_]()global()%s*[=.%[]") do
      diffs[#diffs+1] = {
        start  = start,
        finish = finish - 1,
        text = gname,
      }
      replaced = true
    end

    -- and "define" it at the start of any file that used it
    if replaced then
      diffs[#diffs+1] = {
        start  = 1,
        finish = 0,
        text = gname.."={}\n",
      }
    end
  end

  return diffs
end