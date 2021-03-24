
local util = require("factorio-plugin.util")

---@param uri string @ The uri of file
---@param text string @ The content of file
---@param diffs Diff[] @ The diffs to add more diffs to
local function replace(uri, text, diffs)

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
    util.use_source_to_index(chain_diff, i, param, true)

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
        util.extend_chain_diff_elem_text(chain_diff[3], "=")
        chain_diff[4] = {i = s_param_2}
        util.add_diff(diffs, s_add, f_add, "__all_remote_interfaces")
        util.add_chain_diff(chain_diff, diffs)
        util.add_diff(diffs, p_closing_parenth - 1, p_closing_parenth, "")
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
    util.add_diff(diffs, s_call, f_call, "__all_remote_interfaces")

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

return {
  replace = replace,
}
