--##

local util = require("factorio-plugin.util")

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  -- rename `global` so we can tell them apart!
  local this_mod = uri:match("mods[\\/]([^\\/]+)[\\/]")
  if not this_mod then
    if __plugin_dev then
      this_mod = "FallbackModName"
    else
      ---@type table
      local workspace = require("workspace")
      this_mod = (workspace.uri or workspace.getRootUri(uri)):match("[^/\\]+$")
    end
  end
  if this_mod then
    local scenario = uri:match("scenarios[\\/]([^\\/]+)[\\/]")
    if scenario then
      this_mod = this_mod.."__"..scenario
    end
    this_mod = this_mod:gsub("[^a-zA-Z0-9_]","_")
    local global_name = "__"..this_mod.."__global"

    local global_matches = {}
    ---@type number
    for start, finish in text:gmatch("%f[a-zA-Z0-9_]()global()%s*[=.%[]") do
      global_matches[start] = finish
    end
    -- remove matches that where `global` is actually indexing into something (`.global`)
    for start in text:gmatch("%.%s*()global%s*[=.%[]") do
      global_matches[start] = nil
    end
    -- `_ENV.global` and `_G.global` now get removed because of this, we can add them back in
    -- with the code bellow, but it's a 66% performance cost increase for hardly any gain
    -- for start, finish in text:gmatch("_ENV%.%s*()global()%s*[=.%[]") do
    --   global_matches[start] = finish
    -- end
    -- for start, finish in text:gmatch("_G%.%s*()global()%s*[=.%[]") do
    --   global_matches[start] = finish
    -- end

    for start, finish in pairs(global_matches) do
      util.add_diff(diffs, start, finish, global_name)
    end

    -- and "define" it at the start of any file that used it
    if next(global_matches) then
      util.add_diff(diffs, 1, 1, global_name.."={}---@diagnostic disable-line:lowercase-global\n")
    end
  end
end

return {
  replace = replace,
}
