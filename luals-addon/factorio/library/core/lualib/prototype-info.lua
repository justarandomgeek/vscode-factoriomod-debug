---@meta
---@namespace lualib

---@class PrototypeInfo
---@field base_type keyof defines.prototypes
--- The types that directly inherit from this type, includes abstract types
---@field children (string)[]
--- The non-abstract types that qualify for this type.
---
--- eg: `"item"` has entries like `"item"`, `"item-with-label"`, `"item-with-inventory"`, `"blueprint-book"`, and so on.
---@field types (keyof data.raw)[]
--- Whether or not the this type is abstract.
---@field abstract? true
--- The type this one inherits from, if there is one.
---@field parent? string

---@type table<string,PrototypeInfo>
local info

return info