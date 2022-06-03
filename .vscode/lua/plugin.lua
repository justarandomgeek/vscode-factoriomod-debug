--##
-- This is *NOT* plugin.lua for general modding usage, it is customized for the debugger

---@class diff
---@field start  integer # The number of bytes at the beginning of the replacement
---@field finish integer # The number of bytes at the end of the replacement
---@field text   string  # What to replace

---@param  uri  string # The uri of file
---@param  text string # The content of file
---@return nil|diff[]
function OnSetText(uri, text)
  if text:sub(1, 4)=="--##" then return end

  ---@type diff[]
  local diffs = {}
  ---@type fun():number,string,number
  local gmatch = text:gmatch("require%s*%(?%s*['\"]()(.-)()['\"]%s*%)?")
  for start, name, finish in gmatch do
    -- if name has slashes, convert to a dotted path
    if name:match("[\\/]") then
      name = name:gsub("%.lua$",""):gsub("[\\/]",".")
    end

    -- then convert the modname prefix, if any...
    ---@param match string
    ---@return string
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