---@class LuaObject
---@field valid boolean
---@field object_name string

---@class LuaGameScript : LuaObject
---@field create_profiler fun():LuaProfiler
---@field autosave_enabled boolean
---@field auto_save fun(name:string|nil)
game=game

---@class LuaBootstrap : LuaObject
---@field mod_name string
---@field active_mods table<string,string>
---@field level LuaBootstrap.level
script=script

---@class LuaBootstrap.level
---@field mod_name string
---@field level_name string
---@field campaign_name string
---@field is_tutorial string

---@class LuaRemote : LuaObject
---@field call fun(interface:string,function:string,...):...
---@field interfaces table<string,table<string,boolean>>
remote=remote

---@class LuaItemStack : LuaObject
---@field valid_for_read boolean

---@class LuaProfiler : LuaObject
---@field add fun(other:LuaProfiler)
---@field stop fun()
---@field reset fun()

---@class LocalisedString

---@alias Any string|number|table|boolean|LuaObject|nil

---@type table<string,string>
mods=mods

---@type fun(mesg:string|LocalisedString|LuaProfiler)
localised_print=localised_print