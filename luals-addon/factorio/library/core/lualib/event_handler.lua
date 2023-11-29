---@meta _

---@class event_handler
---@field events? event_handler.events
---@field on_nth_tick? {[number]:fun(event:NthTickEventData)}
---@field on_init? fun()
---@field on_load? fun()
---@field on_configuration_changed? fun(data:ConfigurationChangedData)
---@field add_remote_interface? fun()
---@field add_commands? fun()

---@class event_handler_lib
local handler = {}

---@param lib event_handler
handler.add_lib = function(lib) end

---@param libs event_handler[]
handler.add_libraries = function(libs) end

return handler