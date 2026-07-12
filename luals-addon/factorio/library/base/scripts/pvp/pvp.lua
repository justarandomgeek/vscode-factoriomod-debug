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
---@alias EventName keyof Events

---@class (exact) EventData.on_round_end : EventData
---@class (exact) EventData.on_round_start : EventData
---@class (exact) EventData.on_team_lost : EventData
---@field name TeamID
---@class (exact) EventData.on_team_won : EventData
---@field name TeamID
---@class (exact) EventData.on_player_joined_team : EventData
---@field player_index uint32
---@field team Team
---@field force LuaForce

--TODO: The other events

--- The value used to determine the larger team affiliation of a `Team`
---
--- - `"-"` is never an ally with anyone
--- - `uint32` is a set index
--- - `"?"` is an unset random index
--- - `"?"..uint32` is a set random index, will be re-rolled at the start of new rounds
---
--- Matching is done by stripping out the `"?"` and comparing it when passed through a `tonumber()`. First rejecting or giving a bogus value to `"-"`
---@alias AllyIndex string|uint32

--- The internal id for a given team, also corresponds to the name of a LuaForce.
---@alias TeamID string

---@class SelectedOptions<V>
---@field options V[]
---@field selected V

---@alias ItemMap table<data.ItemName,ItemCountType>

---@class TeamColor
---@field name string
---@field color Color -- <h2>Only the array format</h2>

---@class Team
--- The display name for this team.
---
--- Defaults to a random index into [`game.backer_names`](https://lua-api.factorio.com/latest/classes/LuaGameScript.html#backer_names)
---@field name TeamID
--- The name of a color in `Config.colors`. If found invalid, it will be re-chosen randomly.
---@field color string
---@field members LuaPlayer[]
---@field team AllyIndex


---@class Config
---@field game_config GameConfig
---@field team_config TeamConfig
---@field prototypes PrototypeConfig
---@field victory VictoryConditions
--- Any technology ingredients not in this map will prevent the technologies from be initially researched.
---
--- Otherwise the boolean value indicates what technology ingredients were used in initially researched technologies for this round or the former if not currently in one.
---
--- `"none"` is just a symptom of how it was initially constructed. Documented to prevent assuming all keys are valid item names.
---@field research_ingredient_list table<data.ItemName|"none", boolean?>
---@field colors TeamColor[]
--- A mapping of color name to its index into `colors`.
---@field color_map table<string,int>
---@ Preserved for sake that it might work and have type smarts in the future
---@ Reminder to use it for `starting_chest` and `starting_equipment` in that future
---@ field color_map table<keyof self['colors'],int>
---@field teams Team[]
---@field equipment_list table<string, ItemMap>
--- Selectes what in `equipment_list` can and is being used
---@field starting_equipment SelectedOptions<string>
---@field inventory_list table<string, ItemMap>
--- Selectes what in `inventory_list` can and is being used
---@field starting_chest SelectedOptions<string>

--TODO: Check values in individual configs

---@class GameConfig
---@field time_limit MapTick
---@field allow_spectators boolean
---@field no_rush_time MapTick
---@field base_exclusion_time MapTick
---@field reveal_team_positions boolean
---@field reveal_map_center boolean
---@field team_walls boolean
---@field team_moat boolean
---@field team_turrets boolean
---@field turret_ammunition SelectedOptions<data.ItemName>
---@field team_artillery boolean
---@field auto_new_round_time MapTick
---@field protect_empty_teams boolean
---@field enemy_building_restriction boolean
---@field neutral_chests boolean
---@field seed uint32


---@class TeamConfig
---@field friendly_fire boolean
---@field unlock_combat_research boolean
---@field defcon_mode boolean
---@field max_players int
---@field defcon_timer MapTick
---@field starting_chest_multiplier int
---@field research_level SelectedOptions<"none"|data.ItemName>
---@field average_team_displacement number
---@field always_day boolean
---@field evolution_factor double
---@field duplicate_starting_area_entities boolean
---@field technology_price_multiplier double

--NOTE: Some of these probably don't have to be specific entity types.
---@class PrototypeConfig
---@field chest data.ContainerName
---@field wall data.WallName
---@field gate data.GateName
---@field turret data.TurretName
---@field artillery data.ArtilleryTurretName
---@field artillery_ammo data.AmmoItemName
---@field silo data.RocketSiloName
---@field tile_1 data.TileName
---@field tile_2 data.TileName
---@field artillery_remote data.SelectionToolName
---@field oil data.FluidName
---@field oil_resource data.FluidName Unused
---@field moat data.TileName

---@class VictoryConditions
---@field last_silo_standing VictoryCondition.base
---@field space_race VictoryCondition.space_race
---@field production_score VictoryCondition.production_score
---@field oil_harvest VictoryCondition.oil_harvest
---@field kill_score VictoryCondition.kill_score

---@class VictoryCondition.base
---@field active boolean
---@class VictoryCondition.space_race : VictoryCondition.base
---@field required_rockets_sent number
---@class VictoryCondition.production_score : VictoryCondition.base
---@field required_production_score number
---@class VictoryCondition.oil_harvest : VictoryCondition.base
---@field required_oil number
---@class VictoryCondition.kill_score : VictoryCondition.base
---@field required_kill_score number


---@class RemoteInterface
---@field get_event_name fun(n:EventName):Events[EventName]
---@ field get_event_name fun<N: keyof Events = keyof Events>(n:N):Events[N]
---@field get_events fun():Events
---@field get_teams fun():Team[]
---@field get_config fun():Config
---If you are setting `colors` make sure to *also* update `color_map`
---@field set_config fun(c:Partial<Config>)
local interface

-- Currently doesn't work, but it *might* in the future
-- Has more promise than the inline at the moment

---@ generic N: keyof Events = keyof Events
---@ param n N
---@ return Events[N]
-- function iface.get_event_name(n) end


---@type event_handler
local pvp
return pvp
