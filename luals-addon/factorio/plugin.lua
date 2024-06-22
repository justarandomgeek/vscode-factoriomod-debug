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
local client
if not __plugin_dev then
  workspace = require("workspace")
  furi = require("file-uri")
  client = require("client")
end

local arg_parser = require("factorio-plugin.arg-parser")
local util = require("factorio-plugin.util")
local require_module = require("factorio-plugin.require")
local global = require("factorio-plugin.global")
local remote = require("factorio-plugin.remote")
local object_name = require("factorio-plugin.object-name")
local command_line = require("factorio-plugin.command-line")

---@class Diff
---@field start integer @ The number of bytes at the beginning of the replacement
---@field finish integer @ The number of bytes at the end of the replacement
---@field text string @ What to replace

---@alias Diff.ArrayWithCount {[integer]: Diff, ["count"]: integer}

---@param msg string
local function log_info(msg)
  if __plugin_dev then
    print(msg)
    return
  end
  client.logMessage("Info", msg)
  log.info(msg) ---@diagnostic disable-line: undefined-field
end

---@param msg string
local function log_warn(msg)
  if __plugin_dev then
    print(msg)
    return
  end
  client.logMessage("Warning", msg)
  log.warn(msg) ---@diagnostic disable-line: undefined-field
end

---@param args string[]
---@param config ArgsConfig
---@param help_config? ArgsHelpConfig
---@return table? args @ returns `nil` if there was an error, `{help = true}` if it was help
local function parse_and_show_msg_on_error_or_help(args, config, help_config)
  local result, err_or_index = arg_parser.parse(args, config)

  if result and err_or_index < #args then
    result = nil
    err_or_index = string.format("Unknown/too many values. Consumed %d out of %d arguments.", err_or_index, #args)
  end

  if result and not result.help then
    return result
  end

  local long_msg = (result and "\n" or (err_or_index.."\n\n"))..arg_parser.get_help_string(config, help_config)
  if not result then
    client.showMessage("Warning", "Invalid FMTK plugin args: "..err_or_index.." See Output/log for help message.")
    log_warn(long_msg)
  else
    client.showMessage("Info", "See Output/log for FMTK plugin help message.")
    log_info(long_msg)
    result = {help = true}
  end
  return result
end

---@type string
local workspace_uri = __plugin_dev and "file:///dev/null" or select(2, ...)
---@type string|(string[])|{[string]: string|(string[])}
local plugin_args = __plugin_dev and {} or select(3, ...)

if type(plugin_args) == "table" and not plugin_args[1] then
  local keys = {}
  for k in pairs(plugin_args) do
    keys[#keys+1] = k
  end
  -- Sort because I do not trust that they got added to the table in deterministic order.
  -- (Tmk LuaLS's pairs does have insertion iteration order, therefore the mention of "got added".)
  table.sort(keys)
  for _, k in ipairs(keys) do
    if (k:lower():find("factorio", 1, true)) then
      log_info(string.format("FMTK using plugin args from key %q", k))
      plugin_args = plugin_args[k]
      break
    end
  end
end

-- Both to handle LuaLS <= v3.9.3, but also to handle args which were defined using
-- {[string]: string|(string[])}, because I'm 99% certain that'll end up giving us a
-- string instead of actual string arrays (aka I think it's also (a separate) bug.)
if type(plugin_args) == "string" then
  log_warn("FMTK plugin received a string instead of a string array as plugin args.\n\z
    If LuaLS v3.9.3 or lower is used, make sure to update.\n\z
    If the issue persists it is likely a different bug in the LuaLS.")
  plugin_args = {plugin_args}
end

do -- Major trust issues.
  local i = 1
  local c = #plugin_args
  local newI = 1
  while i <= c do
    local arg = plugin_args[i]
    plugin_args[i] = nil
    if type(arg) == "string" then
      plugin_args[newI] = arg
      newI = newI + 1
    else
      log_warn(string.format("FMTK plugin received non string plugin arg %s (type %s)", tostring(arg), type(arg)))
    end
    i = i + 1
  end
end

do
  log_info("FMTK plugin workspace uri: "..workspace_uri)
  local pretty_args = {}
  for i = 1, #plugin_args do
    pretty_args[i] = string.format("%q", plugin_args[i])
  end
  log_info(string.format("FMTK plugin args (%d): %s", #plugin_args, table.concat(pretty_args, ", ")))
end

---@class PluginArgs
---@field ignore string[]?
---@field clusterio_modules boolean

---@type PluginArgs
local args = parse_and_show_msg_on_error_or_help(plugin_args, {
  options = {
    {
      field = "ignore",
      long = "ignore",
      description = "Completely disable the plugin for the given folders or files.\n\z
        Either absolute or relative to the workspace root.",
      type = "string",
      min_params = 1,
      optional = true,
    },
    {
      field = "clusterio_modules",
      long = "clusterio-modules",
      description = "Enable the require module path modification for\n\z
        \"^modules/[^/]-/\" to get replaced with \"module/\",\n\z
        except for \"^modules/clusterio/\" which remains untouched.",
      flag = true,
    },
  },
})--[[@as PluginArgs]]
args = args or {}

---@type table<string, true>
local ignored_paths = {}
for _, path in ipairs(args.ignore or {}) do
  path = workspace.getAbsolutePath(workspace_uri, path) -- Returns a normalized path.
  log_info(string.format("FMTK plugin --ignore %q resolved to %q", workspace_uri, path or "<nil>"))
  if path then
    ignored_paths[path] = true
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

  util.on_pre_process_file(text, diffs)

  require_module.replace(uri, text, diffs, args)
  remote.replace(uri, text, diffs)
  object_name.replace(uri, text, diffs)
  command_line.replace(uri, text, diffs)
  -- The following replacements require other diffs to be created already
  -- to be able to check for their existence to prevent duplication/overlaps.
  global.replace(uri, text, diffs)

  util.on_post_process_file()

  diffs.count = nil
  return diffs
end
