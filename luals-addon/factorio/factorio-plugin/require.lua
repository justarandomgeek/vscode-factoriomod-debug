--##

local util = require("factorio-plugin.util")
local require_module_flag = util.module_flags.require

local client
if not __plugin_dev then
  client = require("client")
end

---@param name string
---@param args PluginArgs
---@return string name
local function handle_gsub_args(name, args)
  if not args.require_path_gsub then return name end

  local untouched_ranges
  if args.require_path_keep then
    untouched_ranges = {}
    for _, pattern in ipairs(args.require_path_keep) do
      local init = 1
      while true do
        local success, start, stop, custom_start, custom_stop = pcall(string.find, name, pattern, init)
        if not success then
          -- Would much prefer the pattern being validated at arg parse time...
          client.showMessage("Warning", string.format("Invalid pattern for --require-path-keep: %q %s.", pattern, start))
          break
        end
        if custom_stop and type(custom_start) == "number" and type(custom_stop) == "number" then
          start = custom_start
          stop = custom_stop - 1 -- Make it inclusive.
        end
        if not start then break end
        untouched_ranges[#untouched_ranges+1] = {start = start, stop = stop}
        init = stop + 1
      end
    end
  end

  for _, pair in ipairs(args.require_path_gsub) do
    local success, new_name = pcall(string.gsub, name, pair.extended_pattern, function(start, whole, ...)
      local count = select("#", ...)
      local parts = {...}
      local stop = parts[count] - 1 -- Make it inclusive.

      if untouched_ranges then
        for _, range in ipairs(untouched_ranges) do
          if not (stop < range.start or range.stop < start) then
            return false -- No replacement, keep original.
          end
        end
      end

      local replacement = pair.replacement
      -- Using a function here to prevent `whole` from getting mangled by gsub's replacement substitutes.
      replacement = string.gsub(replacement, "%%0", function() return whole end)
      for i = 1, math.min(9, count - 1) do
        -- That "%%%%%d" will turn into "%%i" which makes gsub look for "%i".
        replacement = string.gsub(replacement, string.format("%%%%%d", i), function()
          if parts[i] then return parts[i] end
          -- Would much prefer the replacement string being validated at arg parse time...
          client.showMessage("Warning", string.format(
            "Invalid replacement index %%%d for --require-path-gsub: %q, %q.",
            i, pair.pattern, pair.replacement))
          return false
        end)
      end

      if untouched_ranges then
        local char_count_diff = #replacement - (stop - start + 1)
        for _, range in ipairs(untouched_ranges) do
          if stop < range.start then
            range.start = range.start + char_count_diff
            range.stop = range.stop + char_count_diff
          end
        end
      end

      return replacement
    end)

    if success then
      name = new_name
    else
      if not success then
        -- Would much prefer the pattern being validated at arg parse time...
        client.showMessage("Warning", string.format("Invalid pattern for --require-path-gsub: %q, %q: %s.",
          pair.pattern, pair.replacement, new_name))
        break
      end
    end
  end

  return name
end

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
---@param args PluginArgs
local function replace(_, text, diffs, args)
  util.reset_is_disabled_to_file_start()
  for f_require, start, name, finish in
    text:gmatch("require()%s*%(?%s*['\"]()(.-)()['\"]%s*%)?")--[=[@as fun(): integer, integer, string, integer]=]
  do
    local original_name = name

    name = handle_gsub_args(name, args)

    ---Convert the mod name prefix if there is one
    name = name:gsub("^__(.-)__", "%1")

    ---If the path has slashes in it, it may also have an extension
    ---the LS is not expecting. Factorio would also clobber any extension
    ---to .lua anyway. This just strips it to go with the default `?.lua`
    ---search pattern in "Lua.runtime.path"
    ---The test pattern checks for a dotted name after the final slash
    ---The replacement pattern then strips the last dotted segment
    if name:match("[\\/][^\\/]-%.[^.\\/]+$") then
      name = name:gsub("%.[^.\\/]+$", "")
    end

    if name ~= original_name and not util.is_disabled(f_require - 1, require_module_flag) then
      util.add_diff(diffs, start, finish, name)
    end
  end
end

return {
  replace = replace,
}
