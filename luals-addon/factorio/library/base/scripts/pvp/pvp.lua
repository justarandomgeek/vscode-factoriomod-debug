---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field pvp PVPScenario.RemoteInterface

---@namespace PVPScenario

---@class (exact) Events
---@field on_round_end defines.events
---@field on_round_start defines.events
---@field on_team_lost defines.events
---@field on_team_won defines.events
---@field on_player_joined defines.events

---@class Team
--TODO

---@class Config
---@field teams Team[]
--TODO

---@class RemoteInterface
---@generic N: keyof Events
---@field get_event_name fun(n:N):Events[N]
---@field get_events fun():Events
---@field get_teams fun():Team[]
---@field get_config fun():Config
---@field set_config fun(c:Config)

---@type event_handler
local pvp
return pvp
