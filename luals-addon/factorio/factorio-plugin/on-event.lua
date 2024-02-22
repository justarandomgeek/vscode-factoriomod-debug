--##

local util = require("factorio-plugin.util")
local on_event_module_flag = util.module_flags.on_event

---@param event_id_param string
---@return string|nil
local function get_class_name(event_id_param)
  ---@type string|nil
  local id = event_id_param:match("[a-zA-Z_][a-zA-Z0-9_]*$")
  if id and (id:match("^on_()") or id:match("^script_()")) and id ~= "on_configuration_changed" then
    return "EventData."..id
  end
  if event_id_param:match("^['\"%[]()") then
    return "EventData.CustomInputEvent"
  end
end

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)
  ---@param s_func_param integer
  ---@param class_name_getter fun(): (string?)
  local function process_func_param(s_func_param, class_name_getter)
    ---@type integer|nil, integer, string
    local s_func, s_param_name, param_name = text:match("^%s*()function%s*%(%s*()([^)%s]+)", s_func_param)
    if s_func and not util.is_disabled(s_param_name, on_event_module_flag) then
      local class_name = class_name_getter()
      if class_name then
        util.add_diff(diffs, s_func_param, s_func,
          "\n---@diagnostic disable-next-line:undefined-doc-name\n---@param "
          ..param_name.." "..class_name.."\n")
      end
    end
  end

  ---@param s_param integer
  local function process_regular(s_param)
    local param, s_func_param
    local is_table = text:sub(s_param, s_param) == "{"
    if is_table then
      ---@type string|nil, integer
      param, s_func_param = text:match("^(%b{})%s*,()", s_param)
    else
      ---@type string|nil, integer
      param, s_func_param = text:match("^([^,)]-)%s*,()", s_param)
    end

    if param then
      process_func_param(s_func_param, function()
        if is_table then
          ---@type string[]
          local classes = {}
          local f = 1
          for match, f_match in param:gmatch("%s*([^{},]-)%s*,()")--[[@as fun():string, integer]] do
            f = f_match
            classes[#classes+1] = get_class_name(match)
          end
          classes[#classes+1] = get_class_name(param:match("^%{?%s*(.-)%s*%}$", f))
          return classes[1] and table.concat(classes, "|")
        else
          return get_class_name(param)
        end
      end)
    end
  end

  util.reset_is_disabled_to_file_start()
  for s_param in
    string.gmatch(text, "on_event%s*%(%s*()")--[[@as fun():integer]]
  do
    process_regular(s_param)
  end

  util.reset_is_disabled_to_file_start()
  for s_param in
    string.gmatch(text, "[Ee]vent%s*%.%s*register%s*%(%s*()")--[[@as fun():integer]]
  do
    process_regular(s_param)
  end

  util.reset_is_disabled_to_file_start()
  for class_name, s_func_param in
    string.gmatch(text, "[Ee]vent%s*%.%s*([a-zA-Z_][a-zA-Z0-9_]*)%s*%(()")--[[@as fun():string, integer]]
  do
    if class_name ~= "on_configuration_changed" then
      process_func_param(s_func_param, function() return "EventData."..class_name end)
    end
  end
end

return {
  replace = replace,
}
