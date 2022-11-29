---@meta

---@class util
util = {
  table = {}
}

---Deep copies a table
---@generic T
---@param object T
---@return T
function table.deepcopy(object) end

---Compares a table for shallow equality
---@param tbl1 any
---@param tbl2 any
---@return boolean
function table.compare(tbl1, tbl2) end

util.table.deepcopy = table.deepcopy
util.table.compare = table.compare
util.copy = util.table.deepcopy

---The distance between two MapPositions
---@param position1 MapPosition
---@param position2 MapPosition
---@return double
function util.distance(position1, position2) end

---@param pos MapPosition
---@return string
function util.positiontostr(pos) end

---@param ticks uint
---@return string
function util.formattime(ticks) end

--- supports 'rrggbb', 'rgb', 'rrggbbaa', 'rgba', 'ww', 'w'
---@param hex string
---@return Color
function util.color(hex) end

---Multiplies all color channels by alpha
---@generic T: Color
---@param color T
---@return T
function util.premul_color(color) end

---Mixes two colors together
---@param c1 Color
---@param c2 Color
---@return Color
function util.mix_color(c1, c2) end

---@param c1 Color
---@param n number
---@return Color
function util.multiply_color(c1, n) end

---@param color Color
---@param alpha number
---@param normalized_alpha boolean
---@return Color
function util.get_color_with_alpha(color, alpha, normalized_alpha) end

---@param position Vector.1
---@param direction defines.direction
---@param distance number
---@return Vector.1
function util.moveposition(position, direction, distance) end

---@param direction defines.direction
---@return defines.direction
function util.oppositedirection(direction) end

---@param count integer
---@param stripes table
---@return table
function util.multiplystripes(count, stripes) end

---@param x number
---@param y number
---@return Vector.1
function util.by_pixel(x, y) end

---@param x number
---@param y number
---@return Vector.1
function util.by_pixel_hr(x, y) end

---@generic T: table
---@param table_ T
---@param fun_ fun(t: T)
---@return T
function util.foreach_sprite_definition(table_, fun_) end

---@param a Vector.1
---@param b Vector.1
---@return Vector.1
function util.add_shift(a, b) end

---@generic T: table
---@param offset_ Vector.1
---@param table_ T
---@return T
function util.add_shift_offset(offset_, table_) end

---@generic T: Vector.1
---@param shift T
---@param scale number
---@return T|Vector.1
function util.mul_shift(shift, scale) end

---@param amount number
---@param append_suffix boolean
---@return string
function util.format_number(amount, append_suffix) end

---@generic K: AnyBasic
---@param t {[K]:number}
---@param k K
---@param v? number
function util.increment(t, k, v) end

---If both value and data are truthy, returns data, otherwise returns false
---@generic D: any
---@param value any
---@param data D
---@return D|false
function util.conditional_return(value, data) end

-- Recursively merges and/or deep-copies tables.
-- Entries in later tables override entries in earlier ones, unless
-- both entries are themselves tables, in which case they are recursively merged.
-- Non-merged tables are deep-copied, so that the result is brand new.
---@param tables table[]
---@return table
function util.merge(tables) end

---@param entity LuaEntity
---@param item_dict ItemStackDefinition
util.insert_safe = function(entity, item_dict) end

---@param entity LuaEntity
---@param item_dict ItemStackDefinition
util.remove_safe = function(entity, item_dict) end

---@param string string
---@return string[]
util.split_whitespace = function(string) end

---@param inputstr string
---@param sep string
---@return string[]
util.split = function(inputstr, sep) end

---@param str string
---@param start string
---@return boolean
util.string_starts_with = function(str, start) end

---@return LuaPlayer[]
---@deprecated
util.online_players = function() end

---@generic X: number, Lower: number, Upper: number
---@param x X
---@param lower Lower
---@param upper Upper
---@return X|Lower|Upper
util.clamp = function(x, lower, upper) end

---@return string
util.get_walkable_tile = function() end

-- This function takes 2 icons tables, and adds the second to the first, but applies scale,
-- shift and tint to the entire second set.\
-- This allows you to manipulate the entire second icons table in the same way as you would
-- manipulate a single icon when adding to the icons table.
---@param icons1 table
---@param icons2 table
---@param inputs {["scale"]:number?, ["shift"]:Vector.1?, ["tint"]:Color?}
---@param default_icon_size integer
---@return table
function util.combine_icons(icons1, icons2, inputs, default_icon_size) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_damage(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_speed(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_movement_speed(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_range(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_equipment(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_followers(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_capacity(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_stack_size(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_productivity(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_braking_force(technology_icon) end

---@param technology_icon string
---@return table[]
function util.technology_icon_constant_mining(technology_icon) end

---@param energy string
---@return number
function util.parse_energy(energy) end

---@param product table
---@return number
function util.product_amount(product) end

---@param animation_length uint
---@return table
function util.empty_sprite(animation_length) end

---@generic L: table
---@param layer L
---@return L
function util.draw_as_glow(layer) end

-- Does not handle:
--  - explicit tile filters in "selection-tool" items
--  - ItemPrototype::place_as_tile
--  - TilePrototype::next_direction
--  - TilePrototype::transition_merges_with_tile
--  - general tile transitions, only removes tile names from water_tile_type_names
---@param data table --Seriously pass the global data
---@param array_of_tiles_to_remove string[]
function util.remove_tile_references(data, array_of_tiles_to_remove) end

---Remove the first occurance of value from the array
---@param list any[]
---@param value any
util.remove_from_list = function(list, value) end

---@param list any[]
---@return {[any]: true}
util.list_to_map = function(list) end

return util