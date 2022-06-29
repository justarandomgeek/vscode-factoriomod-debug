
--[[
various tables with malformed formatters:
__debugline throws
__debugcontents throws
__debugnext throws
__pairs throws
__next throws
]]

local function badnext(t,k)
  if not k then return 1,"start" end
  if k < 3 then return k+1,"more" end
  error("end")
end

function __DebugAdapter.testVariables()
  return {
    setmetatable({},{
      __debugline = function()
        error("badline")
      end,
      __debugcontents = function()
        error("badcontents")
      end,
    }),
    setmetatable({},{__debugcontents = function ()
      return badnext
    end}),
    setmetatable({},{__pairs = function ()
      error("badpairs")
    end}),
    setmetatable({},{__pairs = function ()
      return badnext
    end}),
  }
end