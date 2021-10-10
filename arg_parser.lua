
local type_defs = {}

local function register_type(definition)
  type_defs[definition.id] = definition
end

register_type{
  id = "string",
  arg_count = 1,
  convert = function(arg, context)
    local success, value = pcall(tostring, arg)
    if not success then
      return nil, value.." "..context.."."
    end
    return value
  end,
  compare = function(left, right)
    return left == right
  end,
  tostring = function(str) return str end,
}

register_type{
  id = "number",
  arg_count = 1,
  convert = function(arg, context)
    local success, value = pcall(tonumber, arg)
    if not success then
      return nil, value.." "..context.."."
    end
    return value
  end,
  compare = function(left, right)
    return left == right
  end,
}

register_type{
  id = "boolean",
  arg_count = 1,
  convert = function(arg, context)
    if arg == "true" or arg == "1" then
      return true
    elseif arg == "false" or arg == "0" then
      return false
    else
      return nil, "Expected a boolean, got '"..tostring(arg).."' "..context.."."
    end
  end,
  compare = function(left, right)
    return left == right
  end,
}

local help_option = {
  field = "help",
  long = "help",
  short = "h",
  description = "Show help message.",
  flag = true,
}

local function get_option_descriptor(option)
  return (option.short and ("-"..option.short) or "")
    ..(option.long and option.short and " | " or "")
    ..(option.long and ("--"..option.long) or "")
end

local function parse(args, config, start_index)
  local err
  local i = (start_index and (start_index - 1)) or 0
  local current
  local function next_arg()
    i = i + 1
    current = args[i]
    return current
  end
  local function peek_next()
    return args[i + 1]
  end

  local function consume_args_and_convert_for_type(type_id, context)
    if not type_defs[type_id] then
      err = "Invalid type_def id '"..type_id.."' "..context..". No type converted registered with that id."
    end
    local type_args = {}
    for j = 1, type_defs[type_id].arg_count do
      if not next_arg() then
        err = "Expected "..j.." arg(s) for the type '"..type_id.."' "..context.."."
      end
      type_args[j] = current
    end
    type_args[#type_args+1] = context
    local result
    result, err = type_defs[type_id].convert(table.unpack(type_args))
    return result
  end

  local no_more_options = false

  local function consume_args_and_convert_for_type_array(type_id, min, max, context)
    local value_count = 0
    local values = {}
    while ((not max) or value_count < max)
      and peek_next()
      and (no_more_options or (value_count < min) or (peek_next():sub(1, 1) ~= "-"))
      and (not err)
    do
      value_count = value_count + 1
      values[value_count] = consume_args_and_convert_for_type(type_id, context)
    end
    if value_count < min then
      err = "Expected "..min..(max and (max ~= min and (" to "..max) or "") or " or more")
        .." parameters of the type '"..type_id.."', got "..value_count.." "..context.."."
    end
    return values
  end

  local result = {}
  local found_options = {}

  local positional_index = 0
  local current_positional
  local function next_positional()
    positional_index = positional_index + 1
    current_positional = config.positional and config.positional[positional_index] or nil
    return current_positional
  end

  while next_arg() do
    if not no_more_options then
      -- first check for options
      if current:sub(1, 1) == "-" then
        local option_config
        if current:sub(2, 2) == "-" then
          local long = current:sub(3)
          if long == "" then
            no_more_options = true
            goto continue
          else
            if long == help_option.long then
              option_config = help_option
            else
              for _, option in ipairs(config.options or {}) do
                if option.long == long then
                  option_config = option
                  break
                end
              end
            end
          end
        else
          local short = current:sub(2)
          if short == "" then
            return nil, "Invalid arg '-'."
          end
          if short == help_option.short then
            option_config = help_option
          else
            for _, option in ipairs(config.options or {}) do
              if option.short == short then
                option_config = option
                break
              end
            end
          end
        end

        if not option_config then
          return nil, "Invalid option '"..current.."'."
        end

        if found_options[option_config] then
          return nil, "Duplicate option '"..get_option_descriptor(option_config).."'."
        end
        found_options[option_config] = true

        if option_config.flag then
          result[option_config.field] = true
        elseif option_config.single_param then
          result[option_config.field] = consume_args_and_convert_for_type(
            option_config.type,
            "for the option '"..get_option_descriptor(option_config).."'"
          )
          if err then
            return nil, err
          end
        else
          result[option_config.field] = consume_args_and_convert_for_type_array(
            option_config.type,
            option_config.min_params or option_config.params,
            option_config.max_params or option_config.params,
            "for the option '"..get_option_descriptor(option_config).."'"
          )
          if err then
            return nil, err
          end
        end
        goto continue
      end
    end

    -- positional args
    no_more_options = true
    if not next_positional() then
      break
    end

    i = i - 1 -- the consume functions expect the current position to be just before what they are consuming

    if current_positional.single then
      result[current_positional.field] = consume_args_and_convert_for_type(
        current_positional.type,
        "for #"..positional_index.." positional arg '"..current_positional.name.."'"
      )
      if err then
        return nil, err
      end
    else
      result[current_positional.field] = consume_args_and_convert_for_type_array(
        current_positional.type,
        current_positional.min_amount or current_positional.amount,
        current_positional.max_amount or current_positional.amount,
        "for #"..positional_index.." positional arg group '"..current_positional.name.."'"
      )
      if err then
        return nil, err
      end
    end

    ::continue::
  end

  for _, option in ipairs(config.options or {}) do
    if not found_options[option] then
      if option.flag then
        result[option.field] = false
      elseif option.single_param then
        if option.optional or (option.default_value ~= nil) then
          result[option.field] = option.default_value
        else
          if not result.help then
            return nil, "Missing option '"..get_option_descriptor(option).."'."
          end
        end
      else
        if (not option.optional) and option.min_amount ~= 0 then
          if not result.help then
            return nil, "Missing option '"..get_option_descriptor(option).."'."
          end
        end
        result[option.field] = {}
      end
    end
  end

  while next_positional() do
    if current_positional.single then
      if not current_positional.optional then
        if not result.help then
          return nil, "Missing #"..positional_index.." positional arg '"..current_positional.name.."'."
        end
      end
    else
      if (not current_positional.optional) and current_positional.min_amount ~= 0 then
        if not result.help then
          return nil, "Missing #"..positional_index.." positional arg group '"..current_positional.name.."'."
        end
      end
      result[current_positional.field] = {}
    end
  end

  return result, i - 1
end

local function get_type(option_or_positional)
  if option_or_positional.flag then
    return ""
  elseif option_or_positional.single_param or option_or_positional.single then
    return " <"..option_or_positional.type..">"
  else
    return " <"..option_or_positional.type.."[]>"
  end
end

local function get_help_string(config, help_config)
  help_config = help_config or {}
  local indent_length = help_config.indent_length or 4
  local label_length = help_config.label_length or 32
  local spacing_length = help_config.spacing_length or 2
  local indent = string.rep(" ", indent_length)
  local full_indent = string.rep(" ", indent_length + label_length + spacing_length)
  local help = {}

  local function add_entry(label, description)
    help[#help+1] = label
    if description then
      if #label > label_length then
        help[#help+1] = "\n"
        help[#help+1] = full_indent
      else
        help[#help+1] = string.rep(" ", label_length - #label + spacing_length)
      end
      help[#help+1] = description:gsub("\n", "\n"..full_indent)
    end
    help[#help+1] = "\n"
  end

  local function add_option(option)
    help[#help+1] = indent
    local label
    if option.flag or option.optional or option.default_value ~= nil then
      label = "["..get_option_descriptor(option)..get_type(option)
      ..(
        option.default_value ~= nil
        and (" | default: "..(type_defs[option.type].tostring or tostring)(option.default_value))
        or ""
      ).."]"
    else
      label = get_option_descriptor(option)..get_type(option)
    end
    add_entry(label, option.description)
  end

  for _, option in ipairs(config.options or {}) do
    add_option(option)
  end

  add_option(help_option)

  if next(config.options or {}) or next(config.positional or {}) then
    help[#help+1] = "\n"
  end

  for _, positional in ipairs(config.positional or {}) do
    help[#help+1] = indent
    local label
    if positional.optional then
      label = "["..get_type(positional).."]"
    else
      label = get_type(positional)
    end
    add_entry(label, positional.description)
  end

  return table.concat(help)
end

---@return table|nil @ returns `nil` if there was an error or request for help
local function parse_and_print_on_error_or_help(args, config, help_config)
  local result, err = parse(args, config)
  if (not result) or result.help then
    if not result then
      print(err)
      print()
    end
    print(get_help_string(config, help_config))
    return nil
  end
  return result
end

---@class ArgsConfigOption
---@field field string
---@field short string|nil @ short option name, defined without leading `-`. used when an option with a single leading `-` is encountered
---@field long string|nil @ long option name, defined without leading `--`. used when an option with leading `-` is encountered
---@field flag boolean|nil @ is this option a flag?
---@field single_param boolean|nil @ does this option take a single parameter?
---@field min_params integer|nil @ when not a flag or single_param, how many params does the array have to have minimum? Default 0
---@field max_params integer|nil @ when not a flag or single_param, how many params is the array allowed to have maximum? Default `nil` meaning unlimited
---@field params integer|nil @ fallback for both min_params and max_params
---@field type string|nil @ (required) id of the type the single_param or array entries have to be. Not used for flags
---@field optional boolean|nil @ is the option optional? implied to be true for flags
---@field default_value any @ the default value to use for optional single_param options. When set, optional is implied to be `true`

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
---@field indent_length integer|nil @ Default 4. Indent for the option/positional labels
---@field label_length integer|nil @ Default 32. Labels will get padded with blank space up to this length. If exceeding the length, the description is put on the next line
---@field spacing_length integer|nil @ Default 2. Space between label and description

return {
  register_type = register_type,
  parse = parse,
  parse_and_print_on_error_or_help = parse_and_print_on_error_or_help,
  get_help_string = get_help_string,
  help_option = help_option, -- one can modify this table by reference
}
