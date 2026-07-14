---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field space-finish-script SpaceFinishScript.RemoteInterface

---@namespace SpaceFinishScript

---@class RemoteInterface
---@field set_victory_location fun(l:data.SpaceLocationName)
---@field set_no_victory fun(b:boolean)
---@field get_no_victory fun():boolean

---@type event_handler
local space_finish_script
return space_finish_script
