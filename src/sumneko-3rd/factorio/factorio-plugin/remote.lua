--##

local util = require("factorio-plugin.util")

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

  -- remote.add_interface

  for preceding_text, s_entire_thing, s_add, f_add, p_open_paren, p_param_1 in
    util.gmatch_at_start_of_line(text, "([^\n]-)()remote%s*%.%s*()add_interface()%s*()%(()") --[[@as fun(): string, integer, integer, integer, integer, integer]]
  do
    if not preceding_text:find("--", 1, true) then

      local chain_diff = {} ---@type ChainDiffElem[]
      local open_paren_diff = {i = p_open_paren, text = ""}
      chain_diff[1] = open_paren_diff

      local name, name_comma_or_paren, s_param_2 = process_param(chain_diff, p_param_1)
      if not name then
        goto continue
      end

      if name_comma_or_paren == "," then
        util.extend_chain_diff_elem_text(chain_diff[3], "=(")
        chain_diff[4] = {i = s_param_2 --[[@as integer]]}
        util.add_diff(diffs, s_add - 1, s_add, text:sub(s_add - 1, s_add - 1).."--\n")
        util.add_diff(diffs, s_add, f_add,
          "__typed_interfaces---@diagnostic disable-line:undefined-field\n")
        util.add_chain_diff(chain_diff, diffs)
      end

      ::continue::
    end
  end



  -- remote.call
  -- this in particular needs to work as you're typing, not just once you're done
  -- which significantly complicates things, like we can't use the commas as reliable anchors

  for preceding_text, s_call, f_call, p_open_paren, s_param_1 in
    util.gmatch_at_start_of_line(text, "([^\n]-)remote%s*%.%s*()call()%s*()%(()")--[[@as fun():string, integer, integer, integer, integer]]
  do
    if not preceding_text:find("--", 1, true) then
      util.add_diff(diffs, s_call - 1, s_call, text:sub(s_call - 1, s_call - 1).."--\n")
      util.add_diff(diffs, s_call, f_call,
        "__typed_interfaces---@diagnostic disable-line:undefined-field\n")

      local chain_diff = {} ---@type ChainDiffElem[]
      local open_paren_diff = {i = p_open_paren, text = ""}
      chain_diff[1] = open_paren_diff

      local name, name_comma_or_paren, s_param_2 = process_param(chain_diff, s_param_1)
      if not name then
        util.remove_diff(diffs)
        goto continue
      end
      ---@cast s_param_2 -nil

      if name_comma_or_paren == "," then
        local func, func_comma_or_paren, p_finish = process_param(chain_diff, s_param_2)
        if not func then
          util.remove_diff(diffs)
          goto continue
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

      ::continue::
    end
  end
end

return {
  replace = replace,
}
