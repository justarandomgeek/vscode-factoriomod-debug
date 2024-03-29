--##

local util = require("factorio-plugin.util")
local global_module_flag = util.module_flags.global
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

    ---@param preceding_text string
    ---@param start integer
    ---@param finish integer
    ---@param ignore_pos integer
    ---@param ignore_char string
    local function add_diffs(preceding_text, start, finish, ignore_pos, ignore_char)
      if matches_to_ignore[start]
        or (ignore_char == "" and not preceding_text:find("=[^%S\n]*$"))
        or util.is_disabled(start, global_module_flag)
      then
        return
      end

      local before = text:sub(start - 1, start - 1)
      if before ~= "" then
        -- Put the newline on a separate diff before the one replacing 'global',
        -- otherwise hovers and syntax highlighting doesn't work.
        -- This can cause issues if there is already a diff for that character,
        -- which is why it's using add_or_append_diff.
        util.add_or_append_diff(diffs, start - 1, before, " --\n")
      end
      util.add_diff(diffs, start, finish, global_name)
      if ignore_char == "" then
        ignore_pos = finish -- Move it directly next to `global`, not past all the whitespace after it.
      end
      -- Put the diagnostic after the '.' otherwise code completion/suggestions don't work.
      util.add_diff(diffs, ignore_pos, ignore_pos + #ignore_char, ignore_char.."---@diagnostic disable-line:undefined-global\n")
    end

    -- There is duplication here, which would usually be handled by a util function,
    -- however since we are dealing with a variable amount of values, creating a generic
    -- function for it would be incredibly inefficient, constantly allocating new tables.
    util.reset_is_disabled_to_file_start()
    for preceding_text, start, finish, ignore_pos, ignore_char, final_pos in
      util.gmatch_at_start_of_line(text, "([^\n]-)%f[a-zA-Z0-9_]()global()[^%S\n]*()([=.%[]?)()")--[[@as fun(): string, integer, integer, integer, string, integer]]
    do
      add_diffs(preceding_text, start, finish, ignore_pos, ignore_char)
      while true do
        if ignore_char == "=" then -- To support `global = global`.
          final_pos = final_pos - 1
        end
        preceding_text, start, finish, ignore_pos, ignore_char, final_pos
          = text:match("^([^\n]-)%f[a-zA-Z0-9_]()global()[^%S\n]*()([=.%[]?)()", final_pos)
        if not start then break end
        add_diffs(preceding_text, start, finish, ignore_pos, ignore_char)
      end
    end
  end
end

return {
  replace = replace,
}
