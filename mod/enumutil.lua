--- swap the keys and values on a table
---@generic T
---@param t table<string,T>
---@param prefix? string
---@param filter? fun(key:string,val:T):boolean
---@return table<T,string>
local function invert(t,prefix,filter)
  local tt = {}
  ---@type string
  for k,v in pairs(t) do
    if not filter or filter(k,v) then
      tt[v] = (prefix or "")..k
    end
  end
  return tt
end


return {invert = invert}