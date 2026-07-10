---@meta

---@namespace data

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@alias ModSettingSettingType ("startup")|("runtime-global")|("double-setting")|("runtime-per-user")

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@alias AnyModSettingPrototype ModBoolSettingPrototype|ModIntSettingPrototype|ModDoubleSettingPrototype|ModStringSettingPrototype|ModColorSettingPrototype

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@class (exact) ModSettingPrototype:PrototypeBase
---@
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_hidden_property)
---@field hidden? boolean
---@
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@field setting_type ModSettingSettingType

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#bool-setting)
---@class (exact) ModBoolSettingPrototype:ModSettingPrototype
---@field type "bool-setting"
---@field default_value boolean
---@field forced_value? boolean

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#int-setting)
---@class (exact) ModIntSettingPrototype:ModSettingPrototype
---@field type "int-setting"
---@field default_value int64
---@field minimum_value? int64
---@field maximum_value? int64
---@field allowed_values? int64[]

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#double-setting)
---@class (exact) ModDoubleSettingPrototype:ModSettingPrototype
---@field type "double-setting"
---@field default_value double
---@field minimum_value? double
---@field maximum_value? double
---@field allowed_values? double[]

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#string-setting)
---@class (exact) ModStringSettingPrototype:ModSettingPrototype
---@field type "string-setting"
---@field default_value string
---@field allow_blank? boolean
---@field auto_trim? boolean
---@field allowed_values? string[]

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#color-setting)
---@class (exact) ModColorSettingPrototype:ModSettingPrototype
---@field type "color-setting"
---@field default_value Color

