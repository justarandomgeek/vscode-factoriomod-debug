local util = require "luals-addon.factorio.factorio-plugin.util"

--[[
	Multi
	Line
	Comment
]]
-- Line comment. Includes newline.
local tests = {
	"string with double quotes",
	'string with single quotes',
	[[long string with
	brackets supports multiple lines
	but not backslashes\]],
	[====[long string with
	[[inner string]]: other long string]====]
}
local file = io.open("test_plugin.lua", "r")
local content = file:read("*a")
file:close()

local parse_result = util.lex_lua_nonexecutables(content)
for _, v in ipairs(parse_result) do
	print("Non-code content at " .. v.from .. " to " .. v.to .. " : " .. v.content)
end
