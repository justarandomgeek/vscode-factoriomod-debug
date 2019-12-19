# VS Code Factorio Mod Debug

This is a debug adapter for developing Factorio mods. It supports breakpoints, stepping, variable access, and the debug console.

## Using Factorio Mod Debug

* Install the **Debug Adapter** mod in Factorio
* Install the **Factorio Mod Debug** extension in VS Code.
* Switch to the debug viewlet and select "Add Configuration..."
* Select the debug environment "Factorio Mod Debug".
* Adjust the paths as required.
* Press the green 'play' button or F5 to start debugging.

## Custom Debug Views

When displaying tables in the Variables window, the debugger will check for metatables, and display them as a special member `<metatable>`. The default lineitem for a table can be overridden by the metamethod `__debugline`, which can be either a string or a function which takes the table as an argument and returns a string. The contents of the table can be overriden by the `__debugchildren` metamethod, which can be `false` to disable expanding children or a function which takes the table as an argument and returns `DebugAdapter.Variable[]`.

## Ignore Functions in Stepping

Functions can be excluded from stepping with `__DebugAdapter.stepIgnore(func)`.
