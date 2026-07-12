---@meta

---@type LuaDebugAdapter
debugadapter = debugadapter --[[@as LuaDebugAdapter]]

---@class (partial) std.metatable
---@field __debugcounts fun(self):int32,int32
---@field __debugchildren fun(self, filters:DebugVariablesFilter): DebugVariable[]