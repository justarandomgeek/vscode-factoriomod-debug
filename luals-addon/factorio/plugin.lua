--##
---cSpell:ignore userdata, nups, nparams

-- (this should probably be in some better location, maybe the readme? i'm not sure)
-- what do the different prefixes for gmatch results mean:
-- s = start, f = finish, p = position, no prefix = an actual string capture

---Dev Notes: confirm "path/to/lua-language-server/script/", in Lua.Workspace.Library for completions

-- define `__plugin_dev` variable used during development with https://github.com/JanSharp/SumnekoLuaPluginDevEnv
---@diagnostic disable-next-line
if false then __plugin_dev = true end

local workspace
local furi
if not __plugin_dev then
  workspace = require("workspace")
  furi = require("file-uri")
end

local require_module = require("factorio-plugin.require")
local global = require("factorio-plugin.global")
local remote = require("factorio-plugin.remote")
local on_event = require("factorio-plugin.on-event")
local object_name = require("factorio-plugin.object-name")
local command_line = require("factorio-plugin.command-line")

---@class Diff
---@field start integer @ The number of bytes at the beginning of the replacement
---@field finish integer @ The number of bytes at the end of the replacement
---@field text string @ What to replace

---@alias Diff.ArrayWithCount {[integer]: Diff, ["count"]: integer}

---@type string
local workspace_uti = select(2, ...)
---@type string[]
local plugin_args = select(3, ...)
---@type table<string, true>
local ignored_paths = {}

if not __plugin_dev then
  local ignoring = false
  for _, arg in ipairs(plugin_args) do
    if arg == "--ignore" then
      ignoring = true
    else
      if ignoring then
        arg = workspace.getAbsolutePath(workspace_uti, arg)
        if arg then
          ignored_paths[workspace.normalize(arg)] = true
        end
      end
    end
  end
end

---@param uri string @ The uri of file
---@param text string @ The content of file
---@return nil|Diff[]
function OnSetText(uri, text)
  if not __plugin_dev then
    local path = furi.decode(uri)
    if path then
      for ignored_path in pairs(ignored_paths) do
        if path:sub(1, #ignored_path) == ignored_path then
          -- log.info("Plugin ignoring "..path.." because of ignored path "..ignored_path)
          return
        end
      end
    end
  end

  ---I can't see a reason to process ---@meta files
  ---Speeds up loading by not reading annotation files
  if text:sub(1, 8) == "---@meta" or text:sub(1, 4) == "--##" then return end

  local diffs = {count = 0} ---@type Diff.ArrayWithCount

  require_module.replace(uri, text, diffs)
  global.replace(uri, text, diffs)
  remote.replace(uri, text, diffs)
  on_event.replace(uri, text, diffs)
  object_name.replace(uri, text, diffs)
  command_line.replace(uri, text, diffs)

  diffs.count = nil
  return diffs
end
