---@class DebugAdapter.Dispatch
local DAdispatch = {}

local function isMainChunk()
  local i = 2 -- no need to check getinfo or isMainChunk
  ---@type string
  local what
  local getinfo = debug.getinfo
  while true do
    local info = getinfo(i,"S")
    if info then
      what = info.what
      i = i + 1
    else
      break
    end
  end
  return what == "main"
end

function DAdispatch.canRemoteCall()
  -- remote.call is only legal from within events, game catches all but on_load
  -- during on_load, script exists and the root of the stack is no longer the main chunk
  return game or script and not isMainChunk()
end

return DAdispatch