--##
---cSpell:ignore userdata

-- (this should probably be in some better location, maybe the readme? i'm not sure)
-- what do the different prefixes for gmatch results mean:
-- s = start, f = finish, p = position, no prefix = an actual string capture

-- allow for require to search relative to this plugin file
-- open for improvements!
if not __plugin_dev and not _G.__factorio_plugin_initialized then
  _G.__factorio_plugin_initialized = true

  ---@type table
  local config = require("config")
  ---@type table
  local fs = require("bee.filesystem")
  ---@type table
  local workspace = require("workspace")

  ---@type userdata
  local plugin_path = fs.path(workspace.getAbsolutePath(config.get('Lua.runtime.plugin')))

  ---@type string
  local new_path = (plugin_path:parent_path() / "?.lua"):string()
  if not package.path:find(new_path, 1, true) then
    package.path = package.path..";"..new_path
  end
end

local require_module = require("factorio-plugin.require")
local global = require("factorio-plugin.global")
local narrow = require("factorio-plugin.narrow")
local remote = require("factorio-plugin.remote")
local type_list = require("factorio-plugin.type-list")
local on_event = require("factorio-plugin.on-event")

---@class Diff
---@field start integer @ The number of bytes at the beginning of the replacement
---@field finish integer @ The number of bytes at the end of the replacement
---@field text string @ What to replace

---@param uri string @ The uri of file
---@param text string @ The content of file
---@return nil|Diff[]
function OnSetText(uri, text)
  if text:sub(1, 4) == "--##" then return end

  local diffs = {count = 0}

  require_module.replace(uri, text, diffs)
  global.replace(uri, text, diffs)
  narrow.replace(uri, text, diffs)
  remote.replace(uri, text, diffs)
  type_list.replace(uri, text, diffs)
  on_event.replace(uri, text, diffs)

  diffs.count = nil
  return diffs
end
