local json = require('__debugadapter__/json.lua')
local script = (type(script)=="table" and rawget(script,"__raw")) or script
local math = math
local mfloor = math.floor

---@class DebugAdapter.Threads
---@field this_thread integer
---@field active_threads DebugProtocol.Thread[]
local DAthreads = {
  __dap = {}
}

---@type DebugProtocol.Thread[]
local active_threads
do
  if not script then
    active_threads = {
      { id = 1, name = "data", },
    }
    DAthreads.this_thread = 1
  elseif script.level.is_simulation then
    active_threads = {
      { id = 1, name = "simulation", },
    }
    DAthreads.this_thread = 1
  else
    active_threads = {
      { id = 1, name = "level", },
    }
    if script.mod_name == "level" then
      DAthreads.this_thread = 1
    end
    for name in pairs(script.active_mods) do
      local i = #active_threads + 1
      active_threads[i] = { id = i, name = name, }
      if name == script.mod_name then
        DAthreads.this_thread = i
      end
    end
  end
end
DAthreads.active_threads = active_threads

---@param seq number
function DAthreads.__dap.threads(seq)
  json.response{body={threads=active_threads},seq=seq}
end


---@param frameId integer
---@return DebugProtocol.Thread thread
---@return integer frameId
---@return integer tag
function DAthreads.splitFrameId(frameId)
  local threadid = mfloor(frameId/1024)
  local thread = active_threads[threadid]
  local i = mfloor((frameId % 1024) / 4)
  local tag = frameId % 4
  return thread,i,tag
end

return DAthreads