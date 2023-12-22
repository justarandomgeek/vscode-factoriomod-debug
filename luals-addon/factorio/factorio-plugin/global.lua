--##

local util = require("factorio-plugin.util")
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
      if text:sub(dot_pos - 1, dot_pos - 1) ~= "." -- If it's a concat, keep it.
        and text:sub(dot_pos - 2, dot_pos - 1) ~= "_G" -- Keep indexes into _G
        and text:sub(dot_pos - 4, dot_pos - 1) ~= "_ENV" -- and _ENV
      then
        matches_to_ignore[start] = true
      end
    end

    local function add_diffs(start, finish, ignore_pos, ignore_char)
      if matches_to_ignore[start] then return end
      local before = text:sub(start - 1, start - 1)
      if before ~= "" then
        -- Put the newline on a separate diff before the one replacing 'global',
        -- otherwise hovers and syntax highlighting doesn't work.
        -- This can cause issues if there is already a diff for that character. Chances of someone writing
        -- that kind of code however are so low that it's a "fix when it gets reported" kind of issue.
        util.add_or_append_diff(diffs, start - 1, before, "--\n")
      end
      util.add_diff(diffs, start, finish, global_name)
      -- Put the diagnostic after the '.' otherwise code completion/suggestions don't work.
      util.add_diff(diffs, ignore_pos, ignore_pos + 1, ignore_char.."---@diagnostic disable-line:undefined-global\n")
    end

    -- There is duplication here, which would usually be handled by a util function,
    -- however since we are dealing with a variable amount of values, creating a generic
    -- function for it would be incredibly inefficient, constantly allocating new tables.
    for preceding_text, start, finish, ignore_pos, ignore_char, final_pos in
      util.gmatch_at_start_of_line(text, "([^\n]-)%f[a-zA-Z0-9_]()global()[^%S\n]*()([=.%[])()")--[[@as fun(): string, integer, integer, integer, string, integer]]
    do
      if preceding_text:find("--", 1, true) then goto continue end
      add_diffs(start, finish, ignore_pos, ignore_char)
      while true do
        preceding_text, start, finish, ignore_pos, ignore_char, final_pos
          = text:match("^([^\n]-)%f[a-zA-Z0-9_]()global()[^%S\n]*()([=.%[])()", final_pos)
        if not start or preceding_text:find("--", 1, true) then break end
        add_diffs(start, finish, ignore_pos, ignore_char)
      end
      ::continue::
    end
  end
end

return {
  replace = replace,
}
