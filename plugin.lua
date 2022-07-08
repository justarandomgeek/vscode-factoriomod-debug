--##
---cSpell:ignore userdata, nups, nparams

-- (this should probably be in some better location, maybe the readme? i'm not sure)
-- what do the different prefixes for gmatch results mean:
-- s = start, f = finish, p = position, no prefix = an actual string capture

---Dev Notes: confirm "path/to/lua-language-server/script/", in Lua.Workspace.Library for completions

-- allow for require to search relative to this plugin file
-- open for improvements!
local fs = require("bee.filesystem")
local workspace = require("workspace")
local scope = require("workspace.scope")
local plugin_path = fs.path(scope.getScope(workspace.rootUri):get('pluginPath'))
local new_path = (plugin_path:parent_path() / "?.lua"):string()
if not package.path:find(new_path, 1, true) then
  package.path = package.path..";"..new_path
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

  ---Not sure about this one if files are in the library it will not process
  ---cross workspace requires seem to require the path in the library?
  --TODO report that as sumneko bug? Needs more testing, maybe individual settings.
  if scope.getScope(uri):isLinkedUri(uri) then return end
  -- if workspace.getRelativePath(uri):find('factorio/data/') then return end

  ---I can't see a reason to process ---@meta files
  ---Speeds up loading by not reading mod debugger annotations.
  if text:sub(1, 8) == "---@meta" or text:sub(1, 4) == "--##" then return end

  local diffs = {count = 0} ---@type Diff[]

  require_module.replace(uri, text, diffs)
  global.replace(uri, text, diffs)
  remote.replace(uri, text, diffs)
  type_list.replace(uri, text, diffs)
  on_event.replace(uri, text, diffs)

  diffs.count = nil
  return diffs
end
