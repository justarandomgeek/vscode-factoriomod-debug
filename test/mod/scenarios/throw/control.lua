remote.add_interface("level",{
	error = function (mesg)
		return error(mesg)
	end,
	perror = function (mesg)
		return pcall(error,mesg)
	end,
})

script.on_event(defines.events.on_tick, function ()
	pcall(function()
		remote.call("test-missing", "none")
	end)
	pcall(remote.call, "test-missing2", "none")

	pcall(function()
		remote.call("debugadapter-tests", "error", "remote1")
	end)
	pcall(remote.call, "debugadapter-tests", "error", "remote2")

	pcall(function()
		remote.call("debugadapter-tests", "call", "level", "error", "remote3")
	end)
	pcall(remote.call, "debugadapter-tests", "call", "level", "error", "remote4")

	pcall(function()
		remote.call("debugadapter-tests", "perror", "premote1")
	end)
	pcall(remote.call, "debugadapter-tests", "perror", "premote2")

	pcall(function()
		remote.call("debugadapter-tests", "call", "level", "perror", "premote3")
	end)
	pcall(remote.call, "debugadapter-tests", "call", "level", "perror", "premote4")

	pcall(error,"pcall1")
	pcall(function()
		error("pcall2")
	end)

	xpcall(function()
		error("xpcall")
	end, function (mesg)
		return mesg
	end)
	error("unhandled")
end)