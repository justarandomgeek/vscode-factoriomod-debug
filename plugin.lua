--##

-- allow for require to search relative to this plugin file
-- open for improvements!
if not _G.__plugin_initialized then
  _G.__plugin_initialized = true

  ---@type table
  local config = require("config")
  ---@type table
  local fs = require("bee.filesystem")
  ---@type table
  local workspace = require("workspace")

  ---@type userdata
  local plugin_path = fs.path(config.config.runtime.plugin)
  if plugin_path:is_relative() then
    plugin_path = fs.path(workspace.path) / plugin_path
  end

  package.path = package.path .. ";" .. (plugin_path:parent_path() / "?.lua"):string()
end

---@class diff
---@field start  integer # The number of bytes at the beginning of the replacement
---@field finish integer # The number of bytes at the end of the replacement
---@field text   string  # What to replace

local replace_remotes
local type_list

---@param  uri  string # The uri of file
---@param  text string # The content of file
---@return nil|diff[]
function OnSetText(uri, text)
  if text:sub(1, 4)=="--##" then return end

  local diffs = {}

  ---@type string|number
  for start, name, finish in text:gmatch("require%s*%(?%s*['\"]()(.-)()['\"]%s*%)?") do
    ---@type string
    local original_name = name
    -- if name has slashes, convert to a dotted path
    if name:match("[\\/]") then
      name = name:gsub("%.lua$",""):gsub("[\\/]",".")
    end

    -- then convert the modname prefix, if any...
    ---@param match string
    ---@return string
    name = name:gsub("^__(.-)__", function(match)
      return match
    end)

    if name ~= original_name then
      diffs[#diffs+1] = {
        start  = start,
        finish = finish - 1,
        text = name,
      }
    end
  end

  -- rename `global` so we can tell them apart!
  local thismod = uri:match("mods[\\/]([^\\/]+)[\\/]")
  if thismod then
    local scenario = uri:match("scenarios[\\/]([^\\/]+)[\\/]")
    if scenario then
      thismod = thismod.."__"..scenario
    end
    thismod = thismod:gsub("[^a-zA-Z0-9_]","_")
    local gname = "__"..thismod.."__global"
    local replaced
    ---@type number
    for start, finish in text:gmatch("[^a-zA-Z0-9_]()global()%s*[=.%[]") do
      diffs[#diffs+1] = {
        start  = start,
        finish = finish - 1,
        text = gname,
      }
      replaced = true
    end

    -- and "define" it at the start of any file that used it
    if replaced then
      diffs[#diffs+1] = {
        start  = 1,
        finish = 0,
        text = gname.."={}\n",
      }
    end
  end

  replace_remotes(uri, text, diffs)

  type_list(uri, text, diffs)

  return diffs
end

---if str is a string wrapped in "" or '' get the string inside those quotes
---otherwise returns nil
---@param str string
---@return string|nil
local function try_get_source_string_contents(str)
  return str:match("^[\"']") and str:sub(2, -2)
end

-- ---if str is a valid identifier, returns "." .. str, otherwise the [] equivalent
-- ---@param str string
-- ---@return string
-- local function use_string_to_index_into_table(str)
--   if str:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
--     return "." .. str
--   else
--     return '["' .. str .. '"]'
--   end
-- end

-- ---converts an identifier or string taken from source code
-- ---and converts it into a string that can be appended to something to index
-- ---into said something (most likely a table)
-- ---@param str string
-- ---@return string
-- local function use_source_to_index_into_table(str)
--   local str_contents = try_get_source_string_contents(str)
--   if str_contents then
--     return use_string_to_index_into_table(str_contents)
--   else
--     return "[" .. str .. "]"
--   end
-- end

---extends the text of a ChainDiffElem or setting it if it is nil
---@param elem ChainDiffElem
---@param text string
local function extend_chain_diff_elem_text(elem, text)
  if elem.text then
    elem.text = elem.text.. text
  else
    elem.text = text
  end
end

---@param diffs diff[]
---@param start number
---@param finish number
---@param replacement string
local function add_diff(diffs, start, finish, replacement)
  diffs[#diffs+1] = {
    start = start,
    finish = finish - 1,
    text = replacement,
  }
end

---@param chain_diff ChainDiffElem[]
---@param i_in_chain_diff number @ index of the elem in `chain_diff` that represents the source
---@param str string
local function modify_chain_diff_to_use_source_to_index_into_table(chain_diff, i_in_chain_diff, str)
  local str_contents = try_get_source_string_contents(str)
  if str_contents and str_contents:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], ".")
    chain_diff[i_in_chain_diff].text = str_contents
  else
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], "[")
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff + 1], "]")
  end
end

---@class ChainDiffElem
---@field i number @ index within the text of the file
---@field text nil|string @ text replacing from this elem's `i` including to the next elem's `i` excluding. When nil no diff will be created. If the last elem has `text` it will treat it as if there was another elem after with with the same `i`

---creates diffs according to the chain_diff. See ChainDiffElem class description for how it works
---@param chain_diff ChainDiffElem[]
---@param diffs diff[]
local function add_chain_diff(chain_diff, diffs)
  local prev_chain_diff_elem = chain_diff[1]
  if not prev_chain_diff_elem then return end
  for i = 2, #chain_diff do
    local chain_diff_elem = chain_diff[i]
    if prev_chain_diff_elem.text then
      diffs[#diffs+1] = {
        start = prev_chain_diff_elem.i,
        finish = chain_diff_elem.i - 1, -- finish is treated as including, which we don't want
        text = prev_chain_diff_elem.text,
      }
    end
    prev_chain_diff_elem = chain_diff_elem
  end
  if prev_chain_diff_elem.text then
    diffs[#diffs+1] = {
      start = prev_chain_diff_elem.i,
      finish = prev_chain_diff_elem.i - 1,
      text = prev_chain_diff_elem.text,
    }
  end
end

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs diff[] @ The diffs to add more diffs to
function replace_remotes(uri, text, diffs)

  -- remote.add_interface
  -- TODO: impl

  -- ---@type string|number
  -- for sadd, fadd, popen_parenth, sname, name, fname, picomma
  -- in
  --   text:gmatch("remote%s*%.%s*()add_interface()%s*()%(()%s*(.-)%s*()(),")
  -- do
  --   add_diff(diffs, sadd, fadd, "__all_remote_interfaces")
  --   add_diff(diffs, popen_parenth, popen_parenth + 1, "")
  --   add_diff(diffs, sname, fname, use_source_to_index_into_table(name))
  --   add_diff(diffs, picomma, picomma + 1, "=")
  -- end

  -- ---@type string|number
  -- for start, finish in text:gmatch("()%}%)()") do
  --   add_diff(diffs, start, finish, "}")
  -- end



  -- remote.call
  -- this in particular needs to work as you're typing, not just once you're done
  -- which segnificantly complicates things, like we can't use the commas as reliable anchors
  -- s = start, f = finish, p = position, no prefix = an actual string capture

  ---@type string|number
  for s_call, f_call, p_open_parenth, s_name
  in
    text:gmatch("remote%s*%.%s*()call()%s*()%(%s*()")
  do
    add_diff(diffs, s_call, f_call, "__all_remote_interfaces")

    ---@type ChainDiffElem[]
    local chain_diff = {}
    local open_parenth_diff = {i = p_open_parenth, text = ""}
    chain_diff[1] = open_parenth_diff

    -- TODO: since name and func are now always literal strings the
    -- modify_chain_diff_to_use_source_to_index_into_table call can be simplified

    ---@type string|number|nil
    local name, f_name, name_comma_or_parenth, s_param_2 = text:match("^([\"'][^\"']*[\"'])()%s*([,)])()", s_name)
    if not name then
      diffs[#diffs] = nil
      goto continue
    end
    chain_diff[2] = {i = s_name}
    chain_diff[3] = {i = f_name}
    modify_chain_diff_to_use_source_to_index_into_table(chain_diff, 2, name)

    if name_comma_or_parenth == "," then
      ---@type string|number|nil
      local s_func, func, f_func, func_comma_or_parenth, p_finish = text:match("^%s*()([\"'][^\"']*[\"'])()%s*([,)])()", s_param_2)
      if not func then
        diffs[#diffs] = nil
        goto continue
      end
      chain_diff[4] = {i = s_func}
      local finish_chain_diff_elem = {i = f_func}
      chain_diff[5] = finish_chain_diff_elem
      modify_chain_diff_to_use_source_to_index_into_table(chain_diff, 4, func)


      chain_diff[6] = {i = p_finish}
      if func_comma_or_parenth == ")" then
        extend_chain_diff_elem_text(finish_chain_diff_elem, "()")
      else
        if text:match("^%s*%)", p_finish) then
          extend_chain_diff_elem_text(finish_chain_diff_elem, "(,") -- unexpected symbol near ','
        else
          extend_chain_diff_elem_text(finish_chain_diff_elem, "(")
        end
      end
    end

    add_chain_diff(chain_diff, diffs)

    ::continue::
  end
end


--[[ ---@typelist ]]

---count how often the pattern matches in the given string
---@param s string
---@param pattern string
---@return integer
local function match_count(s, pattern)
  local c = 0
  for _ in s:gmatch(pattern) do
    c = c + 1
  end
  return c
end

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs diff[] @ The diffs to add more diffs to
function type_list(uri, text, diffs)
  ---@type string|number
  for s_typelist_str, typelist_str, s_next_line, next_line
  in
    text:gmatch("()---@typelist([^\n]*)\n()([^\n]*)")
  do

    ---@type string[]
    local types = {}
    do
      local open_count = 0
      ---@type string
      local current_type = nil
      for part in typelist_str:gmatch("[^,]*") do
        if current_type then
          current_type = current_type .. "," .. part
        else
          current_type = part
        end
        open_count = open_count + match_count(part, "[%(<]")
        open_count = open_count - match_count(part, "[%)>]")
        if open_count == 0 then
          ---@type string
          types[#types+1] = current_type
          current_type = nil
        elseif open_count < 0 then
          goto continue
        end
      end
      if current_type then
        types[#types+1] = current_type
      end
    end

    add_diff(diffs, s_typelist_str, s_next_line, "--") -- to prevent the wanring of a line with only spaces

    local i = 0
    ---@type number
    for s_list_item in next_line:gmatch("()[^,]*") do
      i = i + 1
      local current_type = types[i]
      if not current_type then break end
      local insert_position = s_next_line + s_list_item - 1
      add_diff(diffs, insert_position, insert_position, "\n---@type " .. current_type .. "\n")
    end

    ::continue::
  end
end
