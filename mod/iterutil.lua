local next = next
local unpack = table.unpack

---@generic K, V
---@param t table<K,V[]>
---@param k K
---@return K nextk
---@return V[] ...@unpacked values
local function nextuple(t,k)
  local nextk,nextv = next(t,k)
  return nextk,unpack(nextv)
end

---@alias DebugAdapter.RenderFilter string|number

---@class DebugAdapter.RenderOptionsWithFilter: DebugAdapter.RenderOptions
---@field filter DebugAdapter.RenderFilter

---@class DebugAdapter.SectionedIterState
---@field sections table[]
---@field filter? DebugAdapter.RenderFilter

---@generic K, V
---@param section_opts table<K,DebugAdapter.RenderFilter|DebugAdapter.RenderOptionsWithFilter>
---@return fun(t:DebugAdapter.SectionedIterState,k:K,filter?:DebugAdapter.RenderFilter):K?,V?,DebugAdapter.RenderOptions?
local function sectioned_next(section_opts)
  ---@generic K, V
  ---@param state DebugAdapter.SectionedIterState
  ---@param k K
  ---@return K? name
  ---@return V? value
  ---@return DebugAdapter.RenderOptions? opts
  return function(state,k)
    local sections = state.sections
    local filter = state.filter
    local sectionk,sectiont = next(sections)
    ::nextt::
    if sectionk==nil then return end
    while true do
      local nextk,nextv = next(sectiont,k)
      if nextk==nil then
        sections[sectionk] = nil
        k = nil
        sectionk,sectiont = next(sections)
        goto nextt
      end
      local opts = section_opts[nextk]
      local topts = type(opts)
      if topts == "table" then ---@cast opts DebugAdapter.RenderOptionsWithFilter
        if opts.filter == filter then
          return nextk,nextv,opts
        end
      else ---@cast opts DebugAdapter.RenderFilter
        if opts == filter then
          return nextk,nextv
        end
      end
      k = nextk
    end
  end
end

---@generic K,V
---@param sections table<K,V>
---@param section_opts table<string,DebugAdapter.RenderFilter|DebugAdapter.RenderOptionsWithFilter>
---@return DebugAdapter.DebugContents<K,V,DebugAdapter.RenderFilter>
local function sectioned_contents(sections, section_opts)
  local _sectioned_next = sectioned_next(section_opts)

  ---@generic K,V
  ---@param t table<K,V>
  ---@param filter? DebugAdapter.RenderFilter
  ---@return DebugAdapter.DebugNext<K,V,DebugAdapter.RenderFilter>
  ---@return DebugAdapter.SectionedIterState
  return function(t,filter)
    return _sectioned_next,{sections={sections,t},filter=filter}
  end
end

---@class DebugAdapter.iterutil
return {
  nextuple = nextuple,
  sectioned_next= sectioned_next,
  sectioned_contents = sectioned_contents,
}