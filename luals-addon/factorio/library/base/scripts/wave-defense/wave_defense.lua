---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field wave_defense WaveDefense.RemoteInterface

---@namespace WaveDefense

---@class (exact) Events
---@field on_round_started defines.events

---@class Config
--TODO

---@class RemoteInterface
---@field set_config fun(config:Config)
---@field get_config fun():Config
---@field get_events fun():Events

---@type event_handler
local wave_defense
return wave_defense
