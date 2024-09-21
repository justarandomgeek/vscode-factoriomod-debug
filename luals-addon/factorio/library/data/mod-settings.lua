---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@alias data.ModSettingSettingType ("startup")|("runtime-global")|("double-setting")|("runtime-per-user")

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@alias data.AnyModSettingPrototype data.ModBoolSettingPrototype|data.ModIntSettingPrototype|data.ModDoubleSettingPrototype|data.ModStringSettingPrototype|data.ModColorSettingPrototype

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@class data.ModSettingPrototype:data.PrototypeBase
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_hidden_property)
---@field hidden? boolean
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@field setting_type data.ModSettingSettingType
local data_ModSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#bool-setting)
---@class data.ModBoolSettingPrototype:data.ModSettingPrototype
---@field type "bool-setting"
---@field default_value boolean
---@field forced_value? boolean
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#int-setting)
---@class data.ModIntSettingPrototype:data.ModSettingPrototype
---@field type "int-setting"
---@field default_value int64
---@field minimum_value? int64
---@field maximum_value? int64
---@field allowed_values? int64[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#double-setting)
---@class data.ModDoubleSettingPrototype:data.ModSettingPrototype
---@field type "double-setting"
---@field default_value double
---@field minimum_value? double
---@field maximum_value? double
---@field allowed_values? double[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#string-setting)
---@class data.ModStringSettingPrototype:data.ModSettingPrototype
---@field type "string-setting"
---@field default_value string
---@field allow_blank? boolean
---@field auto_trim? boolean
---@field allowed_values? string[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#color-setting)
---@class data.ModColorSettingPrototype:data.ModSettingPrototype
---@field type "color-setting"
---@field default_value data.Color
local data_ModBoolSetting={
}
end

