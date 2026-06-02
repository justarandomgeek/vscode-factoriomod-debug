---@meta

---@class util
util = {
  table = {}
}

--- Deep copies a table, making a new table with all of the same values in all of the same places.
--- The new table has no references to the original, leaving you safe to modify either table without modifying the other.
--- If passed a non-table, it returns the value it was given.
---@generic T
---@param object T
---@return T
function table.deepcopy(object) end

--- Checks for deep equality between tbl1 and tbl2.
--- Deep equality is effectively the more "intuitive" version of table equality, comparing tables by value instead of by reference.
---@param tbl1 table
---@param tbl2 table
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

---@param ticks MapTick
---@return string
function util.formattime(ticks) end

--- supports 'rrggbb', 'rgb', 'rrggbbaa', 'rgba', 'ww', 'w'
---@param hex string
---@return Color
function util.color(hex) end

---Multiplies all color channels by alpha
---@param color Color
---@return Color
function util.premul_color(color) end

---Mixes two colors together
---@param c1 Color
---@param c2 Color
---@return Color
function util.mix_color(c1, c2) end

---@param c1 Color
---@param n number?
---@return Color
function util.multiply_color(c1, n) end

---@param color Color
---@param alpha double
---@param normalized_alpha boolean? Rescales a `0-1` alpha to `0-255` if the color has any fields larger than `1`
---@return Color
function util.get_color_with_alpha(color, alpha, normalized_alpha) end

---@type {[defines.direction]:Vector}
util.direction_vectors = {
  [defines.direction.north]          = { 0, -1 },
  [defines.direction.northnortheast] = { 1, -2 },
  [defines.direction.northeast]      = { 1, -1 },
  [defines.direction.eastnortheast]  = { 2, -1 },
  [defines.direction.east]           = { 1,  0 },
  [defines.direction.eastsoutheast]  = { 2,  1 },
  [defines.direction.southeast]      = { 1,  1 },
  [defines.direction.southsoutheast] = { 1,  2 },
  [defines.direction.south]          = { 0,  1 },
  [defines.direction.southsouthwest] = {-1,  2 },
  [defines.direction.southwest]      = {-1,  1 },
  [defines.direction.westsouthwest]  = {-2,  1 },
  [defines.direction.west]           = {-1,  0 },
  [defines.direction.westnorthwest]  = {-2, -1 },
  [defines.direction.northwest]      = {-1, -1 },
  [defines.direction.northnorthwest] = {-1, -2 },
}

---@param position Vector
---@param direction defines.direction
---@param distance number
---@return Vector
function util.moveposition(position, direction, distance) end


---@param position Vector
---@param orientation number
---@return Vector
function util.rotate_position(position, orientation) end

---@param direction defines.direction
---@return defines.direction
function util.oppositedirection(direction) end

---@generic T: any
---@param count integer
---@param stripes T[]
---@return T[]
function util.multiplystripes(count, stripes) end

--- Divides the given values by 32 to match the pixel per tile ratio
---@param x number
---@param y number
---@return Vector
function util.by_pixel(x, y) end

--- Divides the given values by 64 to match the pixel per tile ratio, when scale is 0.5
---@param x number
---@param y number
---@return Vector
function util.by_pixel_hr(x, y) end

---@generic T: table
---@param table_ T
---@param fun_ fun(t: T)
---@return T
function util.foreach_sprite_definition(table_, fun_) end

---Vectors have to be in array format: https://forums.factorio.com/133724
---@param a Vector
---@param b Vector
---@return Vector
function util.add_shift(a, b) end

---@generic T: {shift?:Vector}
---@param offset_ Vector Affected by https://forums.factorio.com/133724
---@param table_ T
---@return T
function util.add_shift_offset(offset_, table_) end

---@generic T: Vector?
---@param shift T
---@param scale number
---@return T|Vector
function util.mul_shift(shift, scale) end

--- Outputs a number with commas separating the thousands.
--- `append_suffix` will use one of the following suffixes when applicable
--- * `k` for thousands
--- * `M` for millions
--- * `B` for billions
--- * `T` for trillions
---@param amount number
---@param append_suffix boolean?
---@return string
function util.format_number(amount, append_suffix) end

---@generic K: AnyBasic
---@param t {[K]:number}
---@param k K
---@param v? number
function util.increment(t, k, v) end

---If both value and data are truthy, returns data,
---otherwise returns either nil or false depending on what wasn't truthy
---@generic D: any
---@param value any
---@param data D
---@return D|false|nil
function util.conditional_return(value, data) end

-- Recursively merges and/or deep-copies tables.
-- Entries in later tables override entries in earlier ones, unless
-- both entries are themselves tables, in which case they are recursively merged.
-- Non-merged tables are deep-copied, so that the result is brand new.
---@generic T: table
---@param tables T[]
---@return T
function util.merge(tables) end

---@param entity LuaControl?
---@param item_dict {[data.ItemID]:ItemCountType}?
util.insert_safe = function(entity, item_dict) end

---@param entity LuaControl?
---@param item_dict {[data.ItemID]:ItemCountType}?
util.remove_safe = function(entity, item_dict) end

---@param string string?
---@return string[]
util.split_whitespace = function(string) end

--- Splits the given string by each character in the given set of separators.
--- ```lua
--- util.split("1,234.50", ",.") -- outputs {"1", "234", "50"}
--- ```
---@param inputstr string
---@param sep string
---@return string[]
util.split = function(inputstr, sep) end

---@param str string
---@param start string
---@return boolean
util.string_starts_with = function(str, start) end

--- Replaces every instance of `what` with `with` in the given string.
--- This is equivalent to `string.gsub` if it supported non-patterned matching.
---@param str string
---@param what string
---@param with string
---@return string
util.string_replace = function(str, what, with) end

---@generic X: number, Lower: number, Upper: number
---@param x X
---@param lower Lower
---@param upper Upper
---@return X|Lower|Upper
util.clamp = function(x, lower, upper) end

--- Returns the first tile that does not collide with
--- `"item"`, `"object"`, `"player"`, or `"water_tile"` in LuaPrototypes
---@return string
util.get_walkable_tile = function() end

-- This function takes 2 icons tables, and adds the second to the first, but applies scale,
-- shift and tint to the entire second set.\
-- This allows you to manipulate the entire second icons table in the same way as you would
-- manipulate a single icon when adding to the icons table.
---@param icons1 data.IconData[]
---@param icons2 data.IconData[]
---@param inputs {["scale"]:number?, ["shift"]:Vector?, ["tint"]:Color?}
---@param default_icon_size integer
---@return data.IconData[]
function util.combine_icons(icons1, icons2, inputs, default_icon_size) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_damage(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_speed(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_movement_speed(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_range(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_planet(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_equipment(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_followers(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_capacity(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_stack_size(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_productivity(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_recipe_productivity(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_braking_force(technology_icon) end

---@param technology_icon data.FileName
---@return data.IconData[]
function util.technology_icon_constant_mining(technology_icon) end

---@param energy data.Energy
---@return number
function util.parse_energy(energy) end

--- Returns the average amount a ProductPrototype will result in. Uses the same formula as the recipe tooltip.
---
--- Currently does not account for extra_count_fraction: https://forums.factorio.com/133745
---@param product data.ProductPrototype
---@return number
function util.product_amount(product) end

---@return data.SpriteSource
function util.empty_sprite() end

---@param animation_length uint8
---@return data.AnimationParameters
function util.empty_animation(animation_length) end

---@return data.IconData
function util.empty_icon() end

---@generic L: data.SpriteParameters|data.SpritePrototype|data.AnimationPrototype
---@param layer L
---@return L
function util.draw_as_glow(layer) end


---@class sprite_load_input
---@field shift? data.Vector
---@field multiply_shift? double
---@field frame_index? uint32

--- The data structure used by `util.sprite_load`. This is used so some of the information
--- that can shift as renders update can be automatically generated next to the images.
---
--- The filename(s) described in this structure are appended to the end of the string
--- that is used to require the file that should return this structure. So ostensibly
--- the filename of this structure should be the same as the beginning of the pictures.
---@class sprite_load_data
---@field width data.SpriteSizeType
---@field height data.SpriteSizeType
--- Currently only supports array format: https://forums.factorio.com/133724
---@field shift data.Vector
---@field line_length? uint32
--- Only for [SpriteNWaySheet.frames](https://lua-api.factorio.com/latest/types/SpriteNWaySheet.html#frames)?
---@field frames? uint32
---@field filenames? string[]
--- Mandatory if `filenames` is defined
---@field lines_per_file? uint32
--- Mandatory if `filenames` is not defined
---@field filename? string


---@generic T : sprite_load_data|data.SpriteSource
---@param path string Given to a `require()` that should return an instance of [sprite_load_data](lua://sprite_load_data)
---@param table T
---@return T
function util.sprite_load(path, table) end

---@param spritesheets {frame_count:uint?,path:string,scale:number?,dice_y:number?}[]
---@return data.SpriteParameters[]
function util.spritesheets_to_pictures(spritesheets) end

-- Does not handle:
--  - explicit tile filters in "selection-tool" items
--  - ItemPrototype::place_as_tile
--  - TilePrototype::next_direction
--  - TilePrototype::transition_merges_with_tile
--  - general tile transitions, only removes tile names from water_tile_type_names
---@param data data.raw --Seriously pass the global data
---@param array_of_tiles_to_remove string[]
function util.remove_tile_references(data, array_of_tiles_to_remove) end

---Remove the first occurance of value from the array
---@generic T: any
---@param list T[]
---@param value T
---@return boolean
util.remove_from_list = function(list, value) end

---@generic T: any
---@param list T[]
---@return {[T]: true}
util.list_to_map = function(list) end

--- Copies the given product and returns a normalized form factor:
--- - `amount` is converted into matching `amount_min` and `amount_max`
---@param raw_product data.ProductPrototype
---@return data.ProductPrototype
util.normalize_recipe_product = function(raw_product) end

--- Loops over the given recipe's products, and copies the given product
--- and returns the array of normalized products:
--- - `amount` is converted into matching `amount_min` and `amount_max`
---@param recipe data.RecipePrototype
---@return data.ProductPrototype[]
util.normalize_recipe_products = function(recipe) end

---Returns the normalized main product or nil if the recipe defintion is invalid or there is no main product
---@param recipe data.RecipePrototype
---@param normalized_products data.ProductPrototype[]
---@return data.ProductPrototype
util.get_recipe_main_product = function(recipe, normalized_products) end

--- Recursively tint all sprite definitions in the given table.\
--- If `tint` is `false`, all tinting will be removed.
---@generic T: table
---@param array T
---@param tint Color|false
---@return T
function util.recursive_tint(array, tint) end

gram = 1
grams = gram
kg = 1000*grams
tons = 1000*kg
second = 60
minute = 60 * second
hour = 60 * minute
meter = 1
kilometer = 1000

return util
