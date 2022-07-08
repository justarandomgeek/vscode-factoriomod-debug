--##
---cSpell:ignore userdata, nups, nparams

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

  -- now it's getting incredibly hacky, I should look into making a PR
  local is_2_6_0_or_later = debug.getinfo(config.get, "u").nparams > 1
  ---@type userdata
  local plugin_path
  if is_2_6_0_or_later then
    local info = debug.getinfo(3, "uf")
    local scp
    for i = 1, info.nups do
      local name, value = debug.getupvalue(info.func, i)
      if name == "scp" then
        scp = value
      end
    end
    if not scp then
      local i = 1
      while true do
        local name, value = debug.getlocal(3, i)
        if not name then break end
        if name == "scp" then
          scp = value
        end
        i = i + 1
      end
    end
    assert(scp, "Unable to get currently used scope/folder. This is very most likely \z
      caused by internal changes of the language server \z
      in which case the plugin needs to be changed/updated."
    )

    plugin_path = fs.path(workspace.getAbsolutePath(scp.uri, config.get(scp.uri, 'Lua.runtime.plugin')))
  else -- sumneko.lua < 2.6.0
    plugin_path = fs.path(workspace.getAbsolutePath(config.get('Lua.runtime.plugin')))
  end

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
