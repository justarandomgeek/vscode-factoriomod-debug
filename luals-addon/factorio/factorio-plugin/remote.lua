--##

local util = require("factorio-plugin.util")
local remote_add_module_flag = util.module_flags.remote_add
local remote_call_module_flag = util.module_flags.remote_call

---@alias comma_or_paren ','|`)`

---@param _ string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(_, text, diffs)

  ---parse one param and use it to index into the previous table
  ---creates 2 new elements in the chain_diff where the first one
  ---represents the actual string contents or identifier
  ---@param chain_diff ChainDiffElem[]
  ---@param p_param_start integer
  ---@return string|nil
  ---@return comma_or_paren|nil  -- Does this only return the two literal strings/nil
  ---@return integer|nil
  local function process_param(chain_diff, p_param_start)
    ---@type integer, string|nil, integer, comma_or_paren|nil, integer
    local s_param, param, f_param, comma_or_paren, p_param_finish
      = text:match("^%s*()[\"']([^\"']*)[\"']()%s*([,)])()", p_param_start)

    if not param then
      return
    end

    local i = #chain_diff + 1
    chain_diff[i] = {i = s_param}
    chain_diff[i + 1] = {i = f_param}
    util.use_source_to_index(chain_diff, i, param, true)

    return param, comma_or_paren, p_param_finish
  end

  ---remote.add_interface
  ---@param s_entire_thing integer
  ---@param s_add integer
  ---@param f_add integer
  ---@param p_open_paren integer
  ---@param s_param_1 integer
  local function handle_add_interface(s_entire_thing, s_add, f_add, p_open_paren, s_param_1)
    local chain_diff = {} ---@type ChainDiffElem[]
    local open_paren_diff = {i = p_open_paren, text = ""}
    chain_diff[1] = open_paren_diff

    local name, name_comma_or_paren, s_param_2 = process_param(chain_diff, s_param_1)
    if not name then return end

    if name_comma_or_paren == "," and not util.is_disabled(s_entire_thing, remote_add_module_flag) then
      util.extend_chain_diff_elem_text(chain_diff[3], "=(")
      chain_diff[4] = {i = s_param_2 --[[@as integer]]}
      util.add_diff(diffs, s_add - 1, s_add, text:sub(s_add - 1, s_add - 1).."--\n")
      util.add_diff(diffs, s_add, f_add,
        "__typed_interfaces---@diagnostic disable-line:undefined-field\n")
      util.add_chain_diff(chain_diff, diffs)
    end
  end

  ---remote.call
  ---this in particular needs to work as you're typing, not just once you're done
  ---which significantly complicates things, like we can't use the commas as reliable anchors
  ---@param s_entire_thing integer
  ---@param s_call integer
  ---@param f_call integer
  ---@param p_open_paren integer
  ---@param s_param_1 integer
  local function handle_call(s_entire_thing, s_call, f_call, p_open_paren, s_param_1)
    if util.is_disabled(s_entire_thing, remote_call_module_flag) then return end
    util.add_diff(diffs, s_call - 1, s_call, text:sub(s_call - 1, s_call - 1).."--\n")
    util.add_diff(diffs, s_call, f_call,
      "__typed_interfaces---@diagnostic disable-line:undefined-field\n")

    local chain_diff = {} ---@type ChainDiffElem[]
    local open_paren_diff = {i = p_open_paren, text = ""}
    chain_diff[1] = open_paren_diff

    local name, name_comma_or_paren, s_param_2 = process_param(chain_diff, s_param_1)
    if not name then
      util.remove_diff(diffs)
      return
    end
    ---@cast s_param_2 -nil

    if name_comma_or_paren == "," then
      local func, func_comma_or_paren, p_finish = process_param(chain_diff, s_param_2)
      if not func then
        util.remove_diff(diffs)
        return
      end
      ---@cast p_finish -nil

      chain_diff[6] = {i = p_finish}
      if func_comma_or_paren == ")" then
        util.extend_chain_diff_elem_text(chain_diff[5], "()")
      else
        if text:match("^%s*%)", p_finish) then
          util.extend_chain_diff_elem_text(chain_diff[5], "(,") -- unexpected symbol near ','
        else
          util.extend_chain_diff_elem_text(chain_diff[5], "(")
        end
      end
    end

    util.add_chain_diff(chain_diff, diffs)
  end

  util.reset_is_disabled_to_file_start()
  for f_remote, s_add_or_call in
    string.gmatch(text, "remote()%s*%.%s*()")--[[@as fun(): integer, integer]]
  do
    local s_entire_thing = f_remote - #"remote"
    local f_add_or_call, p_open_paren, s_param_1 = text:match("^add_interface()%s*()%(()", s_add_or_call)
    if f_add_or_call then
      handle_add_interface(s_entire_thing, s_add_or_call, f_add_or_call, p_open_paren, s_param_1)
      goto continue
    end

    f_add_or_call, p_open_paren, s_param_1 = text:match("^call()%s*()%(()", s_add_or_call)
    if f_add_or_call then
      handle_call(s_entire_thing, s_add_or_call, f_add_or_call, p_open_paren, s_param_1)
      goto continue
    end

    ::continue::
  end
end

return {
  replace = replace,
}
