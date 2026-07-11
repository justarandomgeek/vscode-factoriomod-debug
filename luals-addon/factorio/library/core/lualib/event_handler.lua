---@meta


---@class (partial) EventMap
---@field on_achievement_gained {data: EventData.on_achievement_gained }
---@field on_ai_command_completed {data: EventData.on_ai_command_completed }
--- ... like 300 more

---@generic E : keyof EventMap
---@class EventToken<E>

---@generic M : EventMap
---@alias EventMapDefines<M> {[E in keyof M]: EventToken<E>}

local events = {}--[[@as EventMapDefines<EventMap>]]

---@generic E : keyof EventMap
---@overload fun(event:EventToken<E>|E, func: fun(e:EventMap[E]["data"]), filters?: EventMap[E]["filters"])
---@overload fun(event:EventToken<E>|E, func?: fun(e:EventMap[E]["data"])|nil)
---@overload fun(event:(EventToken<E>|E)[], func?: fun(e:EventMap[E]["data"])|nil)
function on_event(event, func, filters) end

on_event("on_achievement_gained", function(e) end )
on_event(events.on_achievement_gained, function(e) end )
on_event({"on_achievement_gained", "on_ai_command_completed"}, function(e) end )
on_event({events.on_achievement_gained, events.on_ai_command_completed}, function(e) end )

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