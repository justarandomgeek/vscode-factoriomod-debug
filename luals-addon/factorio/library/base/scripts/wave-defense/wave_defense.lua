---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field wave_defense WaveDefenseRemoteInterface

---@class (exact) WaveDefenseEvents
---@field on_round_started defines.events

---@class WaveDefenseConfig
--TODO

---@class WaveDefenseRemoteInterface
---@field set_config fun(config:WaveDefenseConfig)
---@field get_config fun():WaveDefenseConfig
---@field get_events fun():WaveDefenseEvents

---@type event_handler
local wave_defense
return wave_defense
