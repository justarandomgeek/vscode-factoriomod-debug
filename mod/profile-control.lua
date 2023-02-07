--- Call a function on all profiler hooked mods and collect the results
---@param funcname string
---@return table<string, any>
local function callAll(funcname,...)
  ---@type table<string,any>
  local results = {}
  ---@type function
  local call = remote.call
  ---@type string
  for remotename,_ in pairs(remote.interfaces) do
    local modname = remotename:match("^__profiler_(.+)$")
    if modname then
      results[modname] = call(remotename,funcname,...)
    end
  end
  return results
end

remote.add_interface("profiler",{
  dump = function() return callAll("dump") end,
  slow = function() return callAll("slow") end,
})