---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field pvp PVPScenarioRemoteInterface


---@class (exact) PVPScenarioEvents
---@field on_round_end defines.events
---@field on_round_start defines.events
---@field on_team_lost defines.events
---@field on_team_won defines.events
---@field on_player_joined defines.events

---@class PVPScenarioTeam
--TODO

---@class PVPScenarioConfig
---@field teams PVPScenarioTeam[]
--TODO

---@class PVPScenarioRemoteInterface
---@generic N: keyof PVPScenarioEvents
---@field get_event_name fun(n:N):PVPScenarioEvents[N]
---@field get_events fun():PVPScenarioEvents
---@field get_teams fun():PVPScenarioTeam[]
---@field get_config fun():PVPScenarioConfig
---@field set_config fun(PVPScenarioConfig)

---@type event_handler
local pvp
return pvp
