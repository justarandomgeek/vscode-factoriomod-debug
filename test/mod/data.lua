local tests = {
  throw = function ()
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
  end,
  scopes = function ()
    local foo = true
    local bar = false
    __DebugAdapter.breakpoint() -- so we don't have to keep lines lined up...
  end,
}

local testid = settings.startup["dap-test-id"].value
if testid and tests[testid] then
  tests[testid]()
end