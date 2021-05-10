do
  local math = math
  local randomseed = math.randomseed
  function math.randomseed(...)
    __DebugAdapter.print("math.randomseed() has no effect in Factorio. Use LuaRandomGenerator for custom seeded streams",nil,2,"console")
    return randomseed(...)
  end
end