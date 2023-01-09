# Debug Adapter

## Using Factorio Mod Debug

* Install the **Factorio Mod Tool Kit** extension in VS Code.
* Switch to the run/debug view (View->Run) and select "create a launch.json file"
* Select the debug environment "Factorio Mod Debug".
* Adjust the paths and launch settings as required. Check Intellisense for additional launch options.
* Press the green 'play' button or F5 to start debugging.

## Debugging inside Zip Files

If [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer) is also installed, breakpoints and stepping will work inside zipped mods.

## Steam

If you use a Steam install, a file `steam_appid.txt` with content `427520` in the same folder as the factorio binary (there will also be one of `steam_api64.dll`, `libsteam_api.dylib` or `libsteam_api.so` here) is required. If the Debug Adapter has write access to this folder, it will create this automatically. On macs, you may need to "Show Package Contents" to locate the correct folder.

## Runtime Lua Diagnostics

The debugger also injects runtime diagnostics into all hooked mods:

  * Global Assignment: A warning will be issued on the first assignment to an undefined global variable. `__DebugAdapter.defineGlobal(name)` can be used to disable this warning for the given name.
  * Event Handler Replacement: A warning will be issued when an event handler is registered to an event that already has a handler that is not equal to the new one.

## Advanced Features

  * [Debugger Mod API](debugapi.md)
  * [Custom Debug Views](variables.md)