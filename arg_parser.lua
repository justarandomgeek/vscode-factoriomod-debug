
local type_defs = {}

local function register_type(definition)
  type_defs[definition.id] = definition
end

register_type{
  id = "string",
  arg_count = 1,
  convert = function(arg, context, err_level)
    local success, value = pcall(tostring, arg)
    if not success then
      error(value.." "..context..".", err_level)
    end
    return value
  end,
  compare = function(left, right)
    return left == right
  end,
}

register_type{
  id = "number",
  arg_count = 1,
  convert = function(arg, context, err_level)
    local success, value = pcall(tonumber, arg)
    if not success then
      error(value.." "..context..".", err_level)
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
  convert = function(arg, context, err_level)
    if arg == "true" or arg == "1" then
      return true
    elseif arg == "false" or arg == "0" then
      return false
    else
      error("Expected a boolean, got '"..tostring(arg).."' "..context..".", err_level)
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
  description = "Show help message",
  flag = true,
}

local function get_option_descriptor(option)
  return (option.long and ("--"..option.long) or "")
    ..(option.long and option.short and " | " or "")
    ..(option.short and ("-"..option.short) or "")
end

local function parse(args, config, start_index)
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

  local function consume_args_and_convert_for_type(type_id, context, err_level)
    if not type_defs[type_id] then
      error("Invalid type_def id '"..type_id.."' "..context..". No type converted registered with that id.", err_level)
    end
    local type_args = {}
    for j = 1, type_defs[type_id].arg_count do
      if not next_arg() then
        error("Expected "..j.." arg(s) for the type '"..type_id.."' "..context..".", err_level)
      end
      type_args[j] = current
    end
    type_args[#type_args+1] = context
    type_args[#type_args+1] = err_level
    return type_defs[type_id].convert(table.unpack(type_args))
  end

  local no_more_options = false

  local function consume_args_and_convert_for_type_array(type_id, min, max, context, err_level)
    local value_count = 0
    local values = {}
    while ((not max) or value_count < max)
      and peek_next()
      and (no_more_options or (value_count < min) or (peek_next():sub(1, 1) ~= "-"))
    do
      value_count = value_count + 1
      values[value_count] = consume_args_and_convert_for_type(type_id, context, err_level + 1)
    end
    if value_count < min then
      error("Expected "..min..(max and (max ~= min and (" to "..max) or " or more") or "")
        .." parameters of the type '"..type_id.."', got "..value_count.." "..context..".",
        err_level
      )
    end
    return values
  end

  local result = {}
  local found_options = {}

  local positional_index = 0
  local current_positional
  local function next_positional()
    positional_index = positional_index + 1
    current_positional = config.positional[positional_index]
    return current_positional
  end

  local err_level = 1

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
              for _, option in ipairs(config.options) do
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
            error("Invalid arg '-'.", err_level)
          end
          if short == help_option.short then
            option_config = help_option
          else
            for _, option in ipairs(config.options) do
              if option.short == short then
                option_config = option
                break
              end
            end
          end
        end

        if not option_config then
          error("Invalid option '"..get_option_descriptor(option_config).."'.", err_level)
        end

        if found_options[option_config] then
          error("Duplicate option '"..get_option_descriptor(option_config).."'.", err_level)
        end
        found_options[option_config] = true

        if option_config.flag then
          result[option_config.field] = true
        elseif option_config.single_param then
          result[option_config.field] = consume_args_and_convert_for_type(
            option_config.type,
            "for the option "..get_option_descriptor(option_config),
            err_level + 1
          )
        else
          result[option_config.field] = consume_args_and_convert_for_type_array(
            option_config.type,
            option_config.min_params or option_config.params,
            option_config.max_params or option_config.params,
            "for the option"..get_option_descriptor(option_config),
            err_level + 1
          )
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
        "for #"..positional_index.." positional arg '"..current_positional.name.."'",
        err_level + 1
      )
    else
      result[current_positional.field] = consume_args_and_convert_for_type_array(
        current_positional.type,
        current_positional.min_amount or current_positional.amount,
        current_positional.max_amount or current_positional.amount,
        "for #"..positional_index.." positional arg group '"..current_positional.name.."'",
        err_level + 1
      )
    end

    ::continue::
  end

  for _, option in ipairs(config.options) do
    if not found_options[option] then
      if option.flag then
        result[option.field] = false
      elseif option.single_param then
        if option.default_value ~= nil then
          result[option.field] = option.default_value
        else
          error("Missing option '"..get_option_descriptor(option).."'.", err_level)
        end
      else
        if (not option.optional) and option.min_amount ~= 0 then
          error("Missing option '"..get_option_descriptor(option).."'.", err_level)
        end
        result[option.field] = {}
      end
    end
  end

  while next_positional() do
    if current_positional.single then
      error("Missing #"..positional_index.." positional arg '"..current_positional.name.."'.", err_level)
    else
      if (not current_positional.optional) and  current_positional.min_amount ~= 0 then
        error("Missing #"..positional_index.." positional arg group '"..current_positional.name.."'.", err_level)
      end
      result[current_positional.field] = {}
    end
  end

  return result, i - 1
end

-- TODO: it should probably somehow automatically print help on parse failure...

local function get_help_string(config)
  error("-- TODO: impl")
end

-- TODO: add EmmyLua docs

return {
  register_type = register_type,
  parse = parse,
  get_help_string = get_help_string,
  help_option = help_option, -- can modify this table by reference
}
