local normalizeLuaSource = require("__debugadapter__/normalizeLuaSource.lua")
local json = require('__debugadapter__/json.lua')

local gmeta = getmetatable(_ENV)
if not gmeta then
  gmeta = {}
  setmetatable(_ENV,gmeta)
end

local oldindex = gmeta.__index
local oldlog = log
local function newlog(mesg)
  local info = debug.getinfo(2,"Sl")
  local body = {
    category = "console",
    output = serpent.line(mesg),
    line = info.currentline,
    source = normalizeLuaSource(info.source),
    };
  print("DBGprint: " .. json.encode(body))
  oldlog({"",info.source,":",info.currentline,": ",mesg})
end

log = nil
local do_old_index = ({
  ["nil"] = function(t,k)
    return nil
  end,
  ["function"] = oldindex,
  ["table"] = function(t,k)
    return oldindex[k]
  end,
})[type(oldindex)]

function gmeta.__index(t,k)
  if k == "log" then
    local parent = debug.getinfo(2,"n")
    local traceback = debug.traceback()
    if parent then
      return newlog
    else
      return oldlog
    end
  end
  return do_old_index(t,k)
end
