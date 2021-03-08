--##

-- (this should probably be in some better location, maybe the readme? i'm not sure)
-- what do the different prefixes for gmatch results mean:
-- s = start, f = finish, p = position, no prefix = an actual string capture

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

---if 'source' is a string wrapped in "" or '' get the string inside those quotes
---otherwise returns nil
---@param source string
---@return string|nil
local function try_parse_string_literal(source)
  ---@type string|number
  local str, f_str = source:match("^[\"']([^\"']*)[\"']%s*()")
  return f_str == #str and str
end

---@param chain_diff ChainDiffElem[]
---@param i_in_chain_diff number @ index of the elem in `chain_diff` that represents the source
---@param source string
---@param is_literal_contents? boolean @ is 'source' the contents of a literal string already
local function use_source_to_index(chain_diff, i_in_chain_diff, source, is_literal_contents)
  local contents = is_literal_contents and source or try_parse_string_literal(source)
  if contents and contents:match("^[a-zA-Z_][a-zA-Z0-9_]*$") then
    -- source is a literal string and a valid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], ".")
    chain_diff[i_in_chain_diff].text = contents
  else
    -- source is a variable, expression or literal string which is an invalid identifier
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff - 1], "[")
    extend_chain_diff_elem_text(chain_diff[i_in_chain_diff + 1], "]")
    -- leaves chain_diff[i_in_chain_diff] untouched
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

  ---parse one param and use it to index into the previous table
  ---creates 2 new elements in the chain_diff where the first one
  ---represents the actual string contents or identifier
  ---@param chain_diff ChainDiffElem[]
  ---@param p_param_start integer
  ---@return string|nil
  ---@return ","|")"|string|nil
  ---@return number|nil
  local function process_param(chain_diff, p_param_start)
    ---@type string|number|nil
    local s_param, param, f_param, comma_or_parenth, p_param_finish
      = text:match("^%s*()[\"']([^\"']*)[\"']()%s*([,)])()", p_param_start)

    if not param then
      diffs[#diffs] = nil
      return nil
    end
    local i = #chain_diff + 1
    chain_diff[i] = {i = s_param}
    chain_diff[i + 1] = {i = f_param}
    use_source_to_index(chain_diff, i, param, true)

    return param, comma_or_parenth, p_param_finish
  end

  -- remote.add_interface

  ---@type string|number
  for s_entire_thing, s_add, f_add, p_open_parenth, p_param_1
  in
    text:gmatch("()remote%s*%.%s*()add_interface()%s*()%(()")
  do

    ---@type ChainDiffElem[]
    local chain_diff = {}
    local open_parenth_diff = {i = p_open_parenth, text = ""}
    chain_diff[1] = open_parenth_diff

    local name, name_comma_or_parenth, s_param_2 = process_param(chain_diff, p_param_1)
    if not name then
      goto continue
    end

    if name_comma_or_parenth == "," then
      -- p_closing_parenth is one past the actual closing parenthesis
      ---@type number
      local p_closing_parenth, f_entire_thing = text:match("^%b()()[^\n]*()", p_open_parenth)

      if p_closing_parenth
        and not text:sub(s_entire_thing, f_entire_thing):find("--##", 1, true)
      then
        extend_chain_diff_elem_text(chain_diff[3], "=")
        chain_diff[4] = {i = s_param_2}
        add_diff(diffs, s_add, f_add, "__all_remote_interfaces")
        add_chain_diff(chain_diff, diffs)
        add_diff(diffs, p_closing_parenth - 1, p_closing_parenth, "")
      end
    end

    ::continue::
  end



  -- remote.call
  -- this in particular needs to work as you're typing, not just once you're done
  -- which segnificantly complicates things, like we can't use the commas as reliable anchors

  ---@type string|number
  for s_call, f_call, p_open_parenth, s_param_1
  in
    text:gmatch("remote%s*%.%s*()call()%s*()%(()")
  do
    add_diff(diffs, s_call, f_call, "__all_remote_interfaces")

    ---@type ChainDiffElem[]
    local chain_diff = {}
    local open_parenth_diff = {i = p_open_parenth, text = ""}
    chain_diff[1] = open_parenth_diff

    local name, name_comma_or_parenth, s_param_2 = process_param(chain_diff, s_param_1)
    if not name then
      goto continue
    end

    if name_comma_or_parenth == "," then
      local func, func_comma_or_parenth, p_finish = process_param(chain_diff, s_param_2)
      if not func then
        goto continue
      end

      chain_diff[6] = {i = p_finish}
      if func_comma_or_parenth == ")" then
        extend_chain_diff_elem_text(chain_diff[5], "()")
      else
        if text:match("^%s*%)", p_finish) then
          extend_chain_diff_elem_text(chain_diff[5], "(,") -- unexpected symbol near ','
        else
          extend_chain_diff_elem_text(chain_diff[5], "(")
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

    if next_line:match("^%s*%-%-") then
      goto continue
    end

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
