script.on_event(defines.events.on_tick, function ()
	local foo = true
	local bar = false
end)

-- some dummy code for breakpoints to land on for validation
local function bptest()

	if type("") == "" then
		local a = 42
	end



end