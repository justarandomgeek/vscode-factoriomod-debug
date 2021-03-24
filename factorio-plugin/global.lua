--##

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)
  -- rename `global` so we can tell them apart!
  local thismod = uri:match("mods[\\/]([^\\/]+)[\\/]")
  if thismod then
    local scenario = uri:match("scenarios[\\/]([^\\/]+)[\\/]")
    if scenario then
      thismod = thismod.."__"..scenario
    end
    thismod = thismod:gsub("[^a-zA-Z0-9_]","_")
    local gname = "__"..thismod.."__global"
    local replaced
    ---@type number
    for start, finish in text:gmatch("[^a-zA-Z0-9_]()global()%s*[=.%[]") do
      diffs[#diffs+1] = {
        start  = start,
        finish = finish - 1,
        text = gname,
      }
      replaced = true
    end

    -- and "define" it at the start of any file that used it
    if replaced then
      diffs[#diffs+1] = {
        start  = 1,
        finish = 0,
        text = gname.."={}\n",
      }
    end
  end
end

return {
  replace = replace,
}
