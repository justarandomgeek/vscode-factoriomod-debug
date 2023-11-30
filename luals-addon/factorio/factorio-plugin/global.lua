--##

local util = require("factorio-plugin.util")
local shared_state = require("factorio-plugin.shared-state")
local workspace
if not __plugin_dev then
  workspace = require("workspace")
end

---Rename `global` so we can tell them apart!
---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  ---Single Workspace/Folder OK, Multi Workspace OK, mods as root OK, mods_path as root uses __mods_path__
  ---Match on mods folder
  local this_mod, path_inside_mod = uri:match("mods[\\/]([^\\/]+)[\\/](.*)")
  if not this_mod then
    -- Being a bit more strict with a slash being before data as nobody should ever be renaming that folder
    this_mod, path_inside_mod = uri:match("[\\/]data[\\/]([^\\/]+)[\\/](.*)")
  end

  if not this_mod then
    path_inside_mod = uri
    if __plugin_dev then
      this_mod = "PluginDevModName"
    else
      this_mod = this_mod or workspace.getRootUri(uri)
      this_mod = this_mod and this_mod:match("[^/\\]+$")
      -- if `this_mod` is still nil at this point then we simply do nothing. using a fallback would
      -- ultimately do nothing because all cases where it didn't find a mod name would use the fallback,
      -- causing it to behave just the same as it would without using a fallback
    end
  end

  if this_mod then
    local inner_name = path_inside_mod:match("scenarios[\\/]([^\\/]+)[\\/]")
    local inner_type = "s"
    if not inner_name then
      local level
      inner_name,level = path_inside_mod:match("campaigns[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/]")
      inner_name = inner_name and inner_name .. "__" .. level
      inner_type = "c"
    end
    if not inner_name then
      inner_name = path_inside_mod:match("tutorials[\\/]([^\\/]+)[\\/]")
      inner_type = "t"
    end

    if inner_name then
      this_mod = this_mod.."__"..inner_type.."__"..inner_name
    end
    this_mod = this_mod:gsub("[^a-zA-Z0-9_]","_")
    local global_name = "__"..this_mod.."__global"

    ---@type table<integer, true>
    local matches_to_ignore = {}
    -- remove matches that where `global` is actually indexing into something (`.global`)
    for dot_pos, start in text:gmatch("()%.[^%S\n]*()global%s*[=.%[]")--[[@as fun():integer, integer]] do
      if text:sub(dot_pos - 1, dot_pos - 1) ~= "." then
        matches_to_ignore[start] = true
      end
    end
    -- `_ENV.global` and `_G.global` now get ignored because of this, we can add them back in
    -- with the code bellow, but it's a 66% performance cost increase for hardly any gain
    -- for start, finish in text:gmatch("_ENV%.%s*()global()%s*[=.%[]") do
    --   matches_to_ignore[start] = nil
    -- end
    -- for start, finish in text:gmatch("_G%.%s*()global()%s*[=.%[]") do
    --   matches_to_ignore[start] = nil
    -- end

    local eq_chain = shared_state.safe_equal_chain
    local diagnostic_disable -- Cache it at least for multiple occurrences of global in one file.

    for preceding_text, start, finish, ignore_pos, ignore_char in
      util.gmatch_at_start_of_line(text, "([^\n]-)%f[a-zA-Z0-9_]()global()%s*()([=.%[])")--[[@as fun(): string, integer, integer, integer, string]]
    do
      if matches_to_ignore[start] or preceding_text:find("--", 1, true) then goto continue end
      local before = text:sub(start - 1, start - 1)
      if before ~= "" then
        -- Put the newline on a separate diff before the one replacing 'global',
        -- otherwise hovers and syntax highlighting doesn't work.
        -- This can cause issues if there is already a diff for that character. Chances of someone writing
        -- that kind of code however are so low that it's a "fix when it gets reported" kind of issue.
        util.add_diff(diffs, start - 1, start, before.."--\n")
      end
      util.add_diff(diffs, start, finish, global_name)
      -- Put the diagnostic after the '.' otherwise code completion/suggestions don't work.
      diagnostic_disable = diagnostic_disable or ("--["..eq_chain.."[@diagnostic disable-line:undefined-global]"..eq_chain.."]\n")
      util.add_diff(diffs, ignore_pos, ignore_pos + 1, ignore_char..diagnostic_disable)
      ::continue::
    end
  end
end

return {
  replace = replace,
}
