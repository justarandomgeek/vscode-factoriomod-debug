---@meta

---@class (partial) LuaRemote.InterfaceMap
---@field sandbox Sandbox.RemoteInterface

---@namespace Sandbox

---@class RemoteInterface
---@field set_chart_distance fun(distance:number)
---@field get_created_items fun():{[data.ItemName]: integer}
---@field set_created_items fun(items:{[data.ItemName]: integer})

---@type event_handler
local sandbox
return sandbox
