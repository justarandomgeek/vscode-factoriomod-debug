---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field wave_defense WaveDefense.RemoteInterface

---@namespace WaveDefense

---@alias ItemMap table<data.ItemName, ItemCountType>

---@class (exact) Events
---@field on_round_started defines.events

---@class DaySettings
---@field ticks_per_day MapTick
---@field dusk number
---@field evening number
---@field morning number
---@field dawn number

---@class Difficulty
---@field starting_area_size number
---@field day_settings DaySettings
---@field starting_chest_items ItemMap
---@field respawn_items ItemMap
---@field bounties table<data.EntityName, integer>
---@field unit_waves table<data.EntityName, [integer, integer|nil]>
---@field wave_power_function "default"|"hard"
---@field speed_multiplier_function "default"
---@field starting_evolution_factor number
---@field bounty_modifier number
---@field unit_prices table<data.EntityName, integer>

---@class Config
---@field difficulties table<keyof defines.difficulty,Difficulty>
---@field map_gen_settings MapGenSettings
---@field infinite boolean

---@class RemoteInterface
---@field set_config fun(config:Config)
---@field get_config fun():Config
---@field get_events fun():Events

---@type event_handler
local wave_defense
return wave_defense
