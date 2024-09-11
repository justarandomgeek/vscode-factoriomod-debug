---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_type_property)
---@alias data.ModSettingType ("bool-setting")|("int-setting")|("double-setting")|("string-setting")|("color-setting")

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@alias data.ModSettingSettingType ("startup")|("runtime-global")|("double-setting")|("runtime-per-user")

---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@alias data.AnyModSetting data.ModBoolSetting|data.ModIntSetting|data.ModDoubleSetting|data.ModStringSetting|data.ModColorSetting

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings)
---@class data.ModSetting
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_name_property)
---@field name string string
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_type_property)
---@field type data.ModSettingType
---@field localised_name? data.LocalisedString
---@field localised_description? data.LocalisedString
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_order_property)
---@field order? string
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_hidden_property)
---@field hidden? boolean
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#The_setting_type_property)
---@field setting_type data.ModSettingSettingType
local data_ModSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#bool-setting)
---@class data.ModBoolSetting:data.ModSetting
---@field default_value boolean
---@field forced_value? boolean
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#int-setting)
---@class data.ModIntSetting:data.ModSetting
---@field default_value int64
---@field minimum_value? int64
---@field maximum_value? int64
---@field allowed_values? int64[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#double-setting)
---@class data.ModDoubleSetting:data.ModSetting
---@field default_value double
---@field minimum_value? double
---@field maximum_value? double
---@field allowed_values? double[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#string-setting)
---@class data.ModStringSetting:data.ModSetting
---@field default_value string
---@field allow_blank? boolean
---@field auto_trim? boolean
---@field allowed_values? string[]
local data_ModBoolSetting={
}
end

do
---[View Documentation](https://wiki.factorio.com/Tutorial:Mod_settings#color-setting)
---@class data.ModColorSetting:data.ModSetting
---@field default_value data.Color
local data_ModBoolSetting={
}
end

