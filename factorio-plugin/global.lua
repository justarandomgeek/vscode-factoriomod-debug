--##

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  -- rename `global` so we can tell them apart!
  local this_mod = uri:match("mods[\\/]([^\\/]+)[\\/]")
  if this_mod then
    local scenario = uri:match("scenarios[\\/]([^\\/]+)[\\/]")
    if scenario then
      this_mod = this_mod.."__"..scenario
    end
    this_mod = this_mod:gsub("[^a-zA-Z0-9_]","_")
    local global_name = "__"..this_mod.."__global"
    local replaced
    ---@type number
    for start, finish in text:gmatch("[^a-zA-Z0-9_]()global()%s*[=.%[]") do
      diffs[#diffs+1] = {
        start  = start,
        finish = finish - 1,
        text = global_name,
      }
      replaced = true
    end

    -- and "define" it at the start of any file that used it
    if replaced then
      diffs[#diffs+1] = {
        start  = 1,
        finish = 0,
        text = global_name.."={}\n",
      }
    end
  end
end

return {
  replace = replace,
}
