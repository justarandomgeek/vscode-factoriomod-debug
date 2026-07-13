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

--- A number that is multiplied by `60*60` before being used as a `MapTick`
---@alias Minutes double

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
---@field modifier_list ModifierList
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


---@class GameConfig
--- How long a game can run.
---@field time_limit Minutes
---@field allow_spectators boolean Unused
--- How long players are restricted to their staring area.
---@field no_rush_time Minutes
--- How long players are restricted from entering enemy bases.
---@field base_exclusion_time Minutes
--- Whether or not the base locations are revealed at the start of the round.
---@field reveal_team_positions boolean
--- Whether or not the center of the map will be charted at the start of the round.
---@field reveal_map_center boolean
--- Whether or not the walls are built from `PrototypeConfig.wall` and `PrototypeConfig.gate`
---@field team_walls boolean
--- Whether or not a boundry of tiles from `PrototypeConfig.moat` is placed to restrict avenues of approach
---@field team_moat boolean
--- Whether or not `PrototypeConfig.artillery` is placed with a stack of 20 `PrototypeConfig.artillery_ammo`.
---@field team_artillery boolean
--- Whether or not `PrototypeConfig.turret` are placed with a stack of 20 `GameConfig.turret_ammunition`.
---@field team_turrets boolean
--- What ammunition the initial turrets will receive a stack of 20 of
---@field turret_ammunition SelectedOptions<data.ItemName>
--- How quickly a new round will be autostarted. `0` means it will not autostart a round.
---@field auto_new_round_time Minutes
--- Whether or not all entities on a force should be made non-destructable when there are no connected players.
---@field protect_empty_teams boolean
--- Whether or not players can build within enemy bases.
---@field enemy_building_restriction boolean
--- Whether or not `"container"` type entities are converted into a neutral force when built. This lets players steal.
---@field neutral_chests boolean
---@field seed uint32


---@class TeamConfig
---@field friendly_fire boolean
--- Whether or not the combat technologies are researched with `TeamConfig.research_level` & `Config.research_ingredient_list`.
---
---	The following are considered combat technologies:
--- - `"follower-robot-count"`
--- - `"energy-weapons-damage"`
--- - `"laser-shooting-speed"`
--- - `"physical-projectile-damage"`
--- - `"weapon-shooting-speed"`
--- - `"stronger-explosives"`
--- - `"refined-flammables"`
--- - `"artillery-shell-range"`
--- - `"artillery-shell-speed"`
---
--- These are within a local variable in `balance.lua` with no way of modifying them.
---@field unlock_combat_research boolean
--- A mode where technology is researched randomly and automatically. Players cannot affect research.
---@field defcon_mode boolean
---@field max_players int
--- How quickly technology should be researched.
---@field defcon_timer Minutes
--- Multiplies the item count for whatever items are being given in `Config.inventory_list`
---@field starting_chest_multiplier double
--- The selected value determines at what point while going through the options that the ingredients are no longer going to be used to research initial technologies.
---
--- Eg: a selected `"logistic-science-pack"` with options `{"none", "automation-science-pack", "logistic-science-pack", ..etc}`
--- will research (almost) all technologies that have only automation, or logistic science packs.
---
--- `Config.research_ingredient_list` can filter out ingredients from within this list by setting them to `nil`,
--- as well as `TeamConfig.unlock_combat_research` determining whether "combat" research is unlocked.
---@field research_level SelectedOptions<"none"|data.ItemName>
--- If found to be smaller than the minimum distance as determined by the starting radius, then it will be automatically increased.
---@field average_team_displacement double
---@field always_day boolean
--- Clamped to `[0,1]`
---@field evolution_factor double
--- Whether or not the entities within the starting area are identical for each team
---@field duplicate_starting_area_entities boolean
--- Default: `1`
---@field technology_price_multiplier? double

--NOTE: Some of these probably don't have to be specific entity types. These are just the ones they are intended for
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
---@field artillery_remote data.SelectionToolName Unused
---@field oil data.FluidName
---@field oil_resource data.FluidName Unused
---@field moat data.TileName

---@class ModifierList
--- The list of all modifiers and bonuses that are applied to `LuaPlayer` every spawn.
---
--- This table is looped over with `pairs`, so you can add any writable numeric fields on `LuaPlayer` you want.
--- Just be aware that the GUI lets users edit them at a value of `(V + 1) * 100`.
---@field character_modifiers ModifierList.character
--- The list of all modifiers and bonuses that are applied to `LuaForce` at the start of the round.
---
--- This table is looped over with `pairs`, so you can add any writable numeric fields on `LuaForce` you want.
--- Just be aware that the GUI lets users edit them at a value of `(V + 1) * 100`.
---@field force_modifiers ModifierList.force
--- The values given to [LuaForce.set_turret_attack_modifier](https://lua-api.factorio.com/latest/classes/LuaForce.html#set_turret_attack_modifier) at the start of the round.
---@field turret_attack_modifier table<data.TurretName,double>
--- The values given to [LuaForce.set_ammo_damage_modifier](https://lua-api.factorio.com/latest/classes/LuaForce.html#set_ammo_damage_modifier) at the start of the round.
---@field ammo_damage_modifier table<data.AmmoCategoryName,double>
--- The values given to [LuaForce.set_gun_speed_modifier](https://lua-api.factorio.com/latest/classes/LuaForce.html#set_gun_speed_modifier) at the start of the round.
---@field gun_speed_modifier table<data.AmmoCategoryName,double>

---@class ModifierList.character
---@field character_running_speed_modifier double
--- This is multplied by the max character health.
---@field character_health_bonus double
---@field character_crafting_speed_modifier double
---@field character_mining_speed_modifier double
---@field character_build_distance_bonus double
---@field character_reach_distance_bonus double
---@class ModifierList.force
---@field worker_robots_speed_modifier double
---@field worker_robots_battery_modifier double
---@field worker_robots_storage_bonus double
---@field mining_drill_productivity_bonus double
---@field inserter_stack_size_bonus double
--- Must be `[0-254]`
---@field bulk_inserter_capacity_bonus uint32
---@field laboratory_speed_modifier double
---@field laboratory_productivity_bonus double
---@field following_robots_lifetime_modifier double
--- Minimum value of `1`
---@field maximum_following_robot_count double
---@field train_braking_force_bonus double

---@class VictoryConditions
---@field last_silo_standing VictoryCondition.base
---@field space_race VictoryCondition.space_race
---@field production_score VictoryCondition.production_score
---@field oil_harvest VictoryCondition.oil_harvest
---@field kill_score VictoryCondition.kill_score

---@class VictoryCondition.base
---@field active boolean
---@class VictoryCondition.space_race : VictoryCondition.base
---@field required_rockets_sent double
---@class VictoryCondition.production_score : VictoryCondition.base
---@field required_production_score double
---@class VictoryCondition.oil_harvest : VictoryCondition.base
---@field required_oil double
---@class VictoryCondition.kill_score : VictoryCondition.base
---@field required_kill_score double


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
