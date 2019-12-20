# VS Code Factorio Mod Debug

This is a debug adapter for developing Factorio mods. It supports breakpoints, stepping, variable access, and the debug console.

## Using Factorio Mod Debug

* Install the **Debug Adapter** mod in Factorio
* Install the **Factorio Mod Debug** extension in VS Code.
* Switch to the debug viewlet and select "Add Configuration..."
* Select the debug environment "Factorio Mod Debug".
* Adjust the paths as required.
* Press the green 'play' button or F5 to start debugging.

## Enabling Debugging In Your Mod

Simply include
```lua
pcall(require,'__debugadapter__/debugadapter.lua')
```
at the top of your `control.lua` script to load the debugger into your Lua State.

In a level (scenario/campaign) script, you can also provide a hint to locate the files inside a mod:
```lua
pcall(require,'__debugadapter__/debugadapter.lua')
if __DebugAdapter then __DebugAdapter.levelPath("modname","scenarios/scenarioname/") end
```

## Custom Debug Views

When displaying tables in the Variables window, the debugger will check for metatables, and display them as a special member `<metatable>`. The default lineitem for a table can be overridden by the metamethod `__debugline`, which can be either a string or a function which takes the table as an argument and returns a string. The contents of the table can be overriden by the `__debugchildren` metamethod, which can be `false` to disable expanding children or a function which takes the table as an argument and returns `DebugAdapter.Variable[]`.

The `variables` module can be used to prepare custom expansions.
```lua
if __DebugAdapter then
  local variables = require("__debugadapter__/variables.lua")
  -- prepare debug metatables here
end
```
This provides various helper methods for preparing variable lineitems and expansions:

```lua
--- Generates a description for `value`.
--- Also returns data type as second return.
---@param value any
---@param short nil | boolean
---@return string lineitem
---@return string datatype
function variables.describe(value,short)

--- Generate a default debug view for `value` named `name`
---@param name string | nil
---@param value any
---@return Variable
function variables.create(name,value)

--- Generate a variablesReference for `name` at frame `frameId`
---@param frameId number
---@param name string
---@return number variablesReference
function variables.scopeRef(frameId,name)

--- Generate a variablesReference for a table-like object
---@param table table
---@param mode string "pairs"|"ipairs"|"count"
---@param showMeta nil | boolean
---@return number variablesReference
function variables.tableRef(table, mode, showMeta)

--- Generate a variablesReference for a LuaObject
---@param luaObject LuaObject
---@param classname string
---@return number variablesReference
function variables.luaObjectRef(luaObject,classname)
```

## Ignore Functions in Stepping

Functions can be excluded from stepping with `__DebugAdapter.stepIgnore(func)`.
