--- swap the keys and values on a table
---@param t table<any,any>
---@return table<any,any>
local function invert(t,prefix,filter)
  local tt = {}
  for k,v in pairs(t) do
    if not filter or filter(k,v) then
      tt[v] = (prefix or "")..k
    end
  end
  return tt
end


return {invert = invert}