---@meta


---@class (partial) EventDataMap
---@field on_achievement_gained EventData.on_achievement_gained
---@field on_ai_command_completed EventData.on_ai_command_completed
---@field on_segmented_unit_died EventData.on_segmented_unit_died
---@field on_nonsense EventData.on_nonsense extends EventData and EventData.on_nonsense or EventData
---@field [string] EventData
--- like 300 more

---@class EventFilterMap
---@field on_segmented_unit_died LuaSegmentedUnitDiedEventFilter
---

---@generic const E: keyof EventDataMap
---@class EventToken<E: keyof EventDataMap>

---@generic const M: EventDataMap = EventDataMap
---@alias EventMapDefines<M: EventDataMap = EventDataMap> {[E in keyof M]: EventToken<E>}

---@type EventMapDefines
local devents

---@generic const E : keyof EventDataMap
---@param event EventToken<E>|E|(EventToken<E>|E)[]
---@param func? fun(e:EventDataMap[E])|nil
---@param filters E extends keyof EventFilterMap and (EventFilterMap[E])[] or never
---@overload fun(event:EventToken<E>|E, func: fun(e:EventDataMap[E]), filters: E extends keyof EventFilterMap and (EventFilterMap[E])[] or never)
---@overload fun(event:EventToken<E>|E, func?: fun(e:EventDataMap[E])|nil)
---@overload fun(event:(EventToken<E>|E)[], func?: fun(e:EventDataMap[E])|nil)
function on_event(event, func, filters) end

on_event("on_achievement_gained", function(e) end, {{filter=""}})
on_event("on_something_else", function(e) end )
on_event(devents.on_achievement_gained, function(e) end )
on_event({"on_achievement_gained", "on_ai_command_completed"}, function(e) end )
on_event({devents.on_achievement_gained, devents.on_ai_command_completed}, function(e) end )
on_event("on_segmented_unit_died", function(e)

end, {{filter = "name" }})

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