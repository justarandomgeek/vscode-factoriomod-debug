---@meta

---@namespace CrashSite

---@alias ItemMap table<data.ItemName, ItemCountType>

---@class ShipPart
---@field name data.EntityName
---@field angle_deviation number
---@field max_distance number
---@field min_separation number
---@field fire_count number

---@class CrashSite
local lib = {}

---@param surface LuaSurface
---@param position MapPosition
---@param ship_items ItemMap
---@param part_items ItemMap
---@param ship_parts ShipPart[]
function lib.create_crash_site(surface, position, ship_items, part_items, ship_parts) end

---@param player LuaPlayer
---@param goal_position MapPosition
function lib.create_cutscene(player, goal_position) end

---@param event EventData
---@return boolean
lib.is_crash_site_cutscene = function(event) end

---@param event EventData
lib.on_player_display_refresh = function(event) end

---@return ShipPart[]
lib.default_ship_parts = function() end

return lib
