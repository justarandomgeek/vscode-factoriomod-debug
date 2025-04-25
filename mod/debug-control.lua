require("__debugadapter__/debugadapter.lua")

script.on_event(defines.events.on_tick, function ()
    print("\xEF\xB7\x90\xEE\x80\x86")
    debug.debug()
end)

script.on_event(prototypes.custom_input["debugadapter-restart-session"], function(event)
    __DebugAdapter.restart();
end)