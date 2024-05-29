# Debug Adapter

## Runtime Lua Diagnostics

The debugger also injects runtime diagnostics into all hooked mods:

  * Event Handler Replacement: A warning will be issued when an event handler is registered to an event that already has a handler that is not equal to the new one.

## Debugging inside Zip Files

If [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer) is also installed, breakpoints and stepping will work inside zipped mods.

## Advanced Features

  * [Debugger Mod API](debugapi.md)
  * [Custom Debug Views](variables.md)