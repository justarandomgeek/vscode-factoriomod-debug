---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field sandbox Sandbox.RemoteInterface

---@namespace Sandbox

---@alias ItemMap table<data.ItemName, ItemCountType>

---@class RemoteInterface
---@field set_chart_distance fun(distance:number)
---@field get_created_items fun():ItemMap
---@field set_created_items fun(items:ItemMap)

---@type event_handler
local sandbox
return sandbox
