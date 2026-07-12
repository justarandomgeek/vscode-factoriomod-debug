---@meta _

---`math.random()` is reimplemented within Factorio to be deterministic, both in the data stage and during runtime.
---
---In the data stage, it is seeded with a constant number. During runtime, it uses the map's global random generator which is seeded with the map seed. The map's global random generator is shared between all mods and the core game, which all affect the random number that is generated. If this behaviour is not desired, `LuaRandomGenerator` can be used to create a random generator that is completely separate from the core game and other mods.
---
---This method can't be used outside of events or during loading. Calling it with non-integer arguments will floor them instead of resulting in an error.
---
---* `math.random()`: Returns a float in the range [0,1).
---* `math.random(m)`: Returns a integer in the range [1, m].
---* `math.random(m, n)`: Returns a integer in the range [m, n].
---
---@overload fun():number
---@overload fun(m: integer|number):integer
---@param m integer|number
---@param n integer|number
---@return integer
---@nodiscard
---@see LuaRandomGenerator
math.random = function(m, n) end

---Using `math.randomseed()` in Factorio has no effect on the random generator, the function does nothing. If custom seeding or re-seeding is desired, `LuaRandomGenerator` can be used instead of `math.random()`.
---@deprecated `math.randomseed()` has no effect in Factorio.
---@param x integer
---@see LuaRandomGenerator
math.randomseed = function (x) end
