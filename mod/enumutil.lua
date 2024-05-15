local pairs = pairs
local _ENV = nil

--- swap the keys and values on a table
---@generic T
---@param t? table<string,T>
---@param prefix? string
---@param filter? fun(key:string,val:T):boolean
---@return table<T,string>?
local function invert(t,prefix,filter)
  if not t then return end
  local tt = {}
  for k,v in pairs(t) do
    if not filter or filter(k,v) then
      tt[v] = (prefix or "")..k
    end
  end
  return tt
end


return {invert = invert}