do
  local math = math
  local randomseed = math.randomseed
  local message = "math.randomseed() has no effect in Factorio."
  if script then
    message = message .. " Use LuaRandomGenerator for custom seeded streams."
  end
  function math.randomseed(...)
    __DebugAdapter.print(message,nil,2,"console")
    return randomseed(...)
  end
end