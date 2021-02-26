---@class diff
---@field start  integer # The number of bytes at the beginning of the replacement
---@field finish integer # The number of bytes at the end of the replacement
---@field text   string  # What to replace

---@param  uri  string # The uri of file
---@param  text string # The content of file
---@return nil|diff[]
function OnSetText(uri, text)
  ---@type diff[]
  local diffs = {}

  for start, name, finish in text:gmatch("require%(?['\"]()(.-)()['\"]%)?") do
    -- if name has slashes, convert to a dotted path
    if name:match("[\\/]") then
      name = name:gsub("%.lua$",""):gsub("[\\/]",".")
    end

    -- then convert the modname prefix, if any...
    name = name:gsub("^__(.-)__", function(match)
      if match == "debugadapter" then
        return "mod"
      end
      return match
    end)

    diffs[#diffs+1] = {
      start  = start,
      finish = finish - 1,
      text = name,
    }
  end

  return diffs
end