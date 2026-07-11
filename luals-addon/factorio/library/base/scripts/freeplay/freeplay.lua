---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field freeplay Freeplay.RemoteInterface

---@namespace Freeplay

---@alias ItemMap table<data.ItemName, ItemCountType>

---@class RemoteInterface
---@field get_created_items fun():ItemMap
---@field set_created_items fun(x:ItemMap)
---@field get_respawn_items fun():ItemMap
---@field set_respawn_items fun(x:ItemMap)
---@field set_skip_intro fun(b:boolean)
---@field get_skip_intro fun():boolean
---@field get_custom_intro_message fun():LocalisedString
---@field set_custom_intro_message fun(x:LocalisedString)
---@field get_chart_distance fun():number
---@field set_chart_distance fun(x:number)
---@field set_disable_crashsite fun(b:boolean)
---@field get_disable_crashsite fun():boolean
---@field get_init_ran fun():boolean
---@field set_ship_items fun(x:ItemMap)
---@field get_ship_items fun():ItemMap
---@field set_debris_items fun(x:ItemMap)
---@field get_debris_items fun():ItemMap
---@field set_ship_parts fun(x:CrashSite.ShipPart[])
---@field get_ship_parts fun():CrashSite.ShipPart[]

---@type event_handler
local freeplay
return freeplay
