--##
---cSpell:ignore userdata, nups, nparams

-- (this should probably be in some better location, maybe the readme? i'm not sure)
-- what do the different prefixes for gmatch results mean:
-- s = start, f = finish, p = position, no prefix = an actual string capture

-- allow for require to search relative to this plugin file
-- open for improvements!

---Notes: confirm "path/to/lua-language-server/script/", in Lua.Workspace.Library
---Notes: confirm "path/to/bee" in Lua.Workspace.Library

if not __plugin_dev and not _G.__factorio_plugin_initialized then
  _G.__factorio_plugin_initialized = true

  local config = require("config")
  local fs = require("bee.filesystem")
  local workspace = require("workspace")

  -- now it's getting incredibly hacky, I should look into making a PR
  local is_2_6_0_or_later = debug.getinfo(config.get, "u").nparams > 1
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
      for i = 1, info.nparams do
        local name, value = debug.getlocal(3, i)
        if name == "scp" then
          scp = value
        end
      end
    end
    assert(scp, "Unable to get currently used scope/folder. This is very most likely \z
      caused by internal changes of the language server \z
      in which case the plugin needs to be changed/updated."
    )

    plugin_path = fs.path(workspace.getAbsolutePath(scp.uri, config.get(scp.uri, 'Lua.runtime.plugin')))
  else -- sumneko.lua < 2.6.0
    ---@diagnostic disable-next-line: missing-parameter
    plugin_path = fs.path(workspace.getAbsolutePath(config.get('Lua.runtime.plugin')))
  end

  local new_path = (plugin_path:parent_path() / "?.lua"):string() --[[@as string]]
  if not package.path:find(new_path, 1, true) then
    package.path = package.path..";"..new_path
  end
end

local require_module = require("factorio-plugin.require")
local global = require("factorio-plugin.global")
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
  ---I can't see a reason to process ---@meta files
  ---Speeds up loading by not reading mod debugger annotations.
  local sub = text:sub(1, 8)
  if sub == "---@meta" or sub == "--##" then return end

  ---Hacky way to ignore data files but it greatly improves startup times if factorio/data is in the library.
  ---This should probably loop through the workspace.library setting and disable if it matches anything but it could
  ---be an issue if the user is using it to load library mods (which I think is a bug) maybe? Todo?.
  local workspace = require("workspace")
  if workspace.getRelativePath(uri):find('factorio/data/') then return end

  local diffs = {count = 0} ---@type Diff[]

  require_module.replace(uri, text, diffs)
  global.replace(uri, text, diffs)
  remote.replace(uri, text, diffs)
  type_list.replace(uri, text, diffs)
  on_event.replace(uri, text, diffs)

  diffs.count = nil
  return diffs
end
