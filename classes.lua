
---@class ArgsConfigOption
---@field field string
---@field short string|nil @ short option name, defined without leading `-`. used when an option with a single leading `-` is encountered
---@field long string|nil @ long option name, defined without leading `--`. used when an option with leading `--` is encountered
---@field description string|nil @ description used in the help message
---@field flag boolean|nil @ is this option a flag?
---@field single_param boolean|nil @ does this option take a single parameter?
---@field min_params integer|nil @ when not a flag or single_param, how many params does the array have to have minimum? Default 0
---@field max_params integer|nil @ when not a flag or single_param, how many params is the array allowed to have maximum? Default `nil` meaning unlimited
---@field params integer|nil @ fallback for both min_params and max_params
---@field type string|nil @ (required) id of the type the single_param or array entries have to be. Not used for flags
---@field optional boolean|nil @ is the option optional? implied to be true for flags
---@field default_value any @ the default value to use for optional options. When set, optional is implied to be `true`

---@class ArgsConfigPositional
---@field single boolean|nil @ is this positional a single value?
---@field min_amount integer|nil @ when not a single, how many args does the array have to have minimum? Default 0
---@field max_amount integer|nil @ when not a single, how many args is the array allowed to have maximum? Default `nil` meaning unlimited
---@field amount integer|nil @ fallback for both min_amount and max_amount
---@field type string @ id of the type the single or array entries have to be
---@field optional boolean|nil @ is the option optional? implied to be true for flags

---@class ArgsConfig
---@field options ArgsConfigOption[]|nil
---@field positional ArgsConfigPositional[]|nil

---@class ArgsHelpConfig
---@field usage string|nil @ When provided a `"Usage: "..usage` line will be added before the help message
---@field indent_length integer|nil @ Default 4. Indent for the option/positional labels
---@field label_length integer|nil @ Default 32. Labels will get padded with blank space up to this length. If exceeding the length, the description is put on the next line
---@field spacing_length integer|nil @ Default 2. Space between label and description
