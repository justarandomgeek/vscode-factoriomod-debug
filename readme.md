# VS Code Factorio Mod Debug

This is a debug adapter for developing Factorio mods. It supports breakpoints, stepping, variable access, and the debug console. Furthermore, this extension offers profiling, packaging and publishing supports for Factorio mods. It also enhances/implements language server features for various Factorio mod file formats, including Factorio API Typedefs for [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua).

## Using Factorio Mod Debug

* Install the **Factorio Mod Debug** extension in VS Code.
* Switch to the run/debug view (View->Run) and select "create a launch.json file"
* Select the debug environment "Factorio Mod Debug".
* Adjust the paths and launch settings as required. Check Intellisense for additional launch options.
* Press the green 'play' button or F5 to start debugging.

## Enabling Debugging In Your Mod

In Factorio >=0.18.10, Instrument Mode is used by default to enable debugging automatically in control stage. Data and Settings stage hooks can be enabled in launch.json, as well as filtering which mods hooks are installed in for Control stage. For most users, this is sufficient and nothing further is required.

If you need to use debugging without Instrument mode, you can set `"useIntrumentMode": false` in launch.json and include a require for the debugadapter at the top of the appropriate stage file (control, data, settings) while debugging:
```lua
require('__debugadapter__/debugadapter.lua')
```
Running without Instrument Mode will disable break-on-exception.

## Enabling Debugging inside Zip Files

If [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer) is also installed, breakpoints and stepping will work inside zipped mods.

## Steam

If you use a Steam install, a file `steam_appid.txt` with content `427520` in the same dir as the factorio binary is required. If VSCode has write access to the dir, it will create this automatically.

## Additional Lua Diagnostics

The debugger also injects diagnostics into all hooked mods:

  * Global Assignment: A warning will be issued on the first assignment to an undefined global variable. `__DebugAdapter.defineGlobal(name)` can be used to disable this warning for the given name.

## Profiling

In Factorio >= 0.18.27, you can set `"hookMode": "profile"` to enable profiling. This mode does not provide stepping or inspection, but instead provides inline timing/hitcount data for every line and function executed in control stage. Flamegraph, higlighting and rulers are also provided to assist in finding hotspots. Mods may recognize the this mode by the presence of the global variable `__Profiler`.

The profiler also provides a remote inteface `profiler` with the following functions:

  * `dump()` - dump all timers immediately
  * `slow()` - return to slow-start mode (dumping on return from every event temporarily)
  * `save(name)` - return to slow-start mode and trigger an autosave with the given name. Defaults to "profiler" if unspecified.

## Factorio API autocompletion

You can generate EmmyLua docs for the Factorio API with the `Factorio: Generate Typedefs` command. Together with the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server, this enables autocompletion and other language server features for the Factorio API.

To use `Factorio: Generate Typedefs`, press `Ctrl-Shift-P` to open the command palette and run the `Factorio: Generate Typedefs` command from there. In the file picker, open `factorio/doc-html/runtime-api.json`, and save the generated Lua file wherever you like. This will also offer to add it to the sumneko library files and adjust other configuration for [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua).

## Automatic Mod Packaging and Publishing

Mods can be automatically Packaged and Published from the "Factorio Mod Packages" panel (in SCM view by default, View->Open View...-> "Factorio Mod Packages" if you can't find it). These tasks can also be accessed in VSCode's Tasks system. Custom scripts will run inside the mod directory and have the environment variables `FACTORIO_MODNAME` and `FACTORIO_MODVERSION` provided. Uploading to the mod portal requires an API key with the `ModPortal: Upload Mods` usage, which can be created on https://factorio.com/profile.

### Datestamp
  * if changelog.txt present and has a section for the current version, update its date to today
  * run `info.json#/package/scripts/datestamp` if set

### Compile
  Compile tasks will be automatically run when starting a debug session if defined.

  * run `info.json#/package/scripts/compile` if set

### Package
  * run `info.json#/package/scripts/compile` if set
  * run `info.json#/package/scripts/prepackage` if set
  * build a zip including all files in the mod directory except dotfiles, zip files, and files matching the list of globs in `info.json#/package/ignore`.

### Increment Version
  * increment version in info.json
  * if changelog.txt present, add new empty section to changelog.txt
  * run `info.json#/package/scripts/version` if set

### Upload
  * select a package in mod directory
  * upload to mod portal

### Publish

All-in-one command.

  * verify no uncommitted changes, on `master` (or branch set in `info.json#/package/git_publish_branch`)
  * run `info.json#/package/scripts/prepublish` if set
  * run **Datestamp**
  * git commit "preparing release of version x.y.z", tag x.y.z
  * run **Package**
  * git tag, unless `info.json#/package/no_git_tag` is set
  * run **Increment Version**
  * run `info.json#/package/scripts/publish` if set
  * commit "moved to version x.y.z"
  * push to git upstream, unless `info.json#/package/no_git_push` is set
  * upload to mod portal, unless `info.json#/package/no_portal_upload` is set
  * run `info.json#/package/scripts/postpublish` if set, with extra environment variable `FACTORIO_MODPACKAGE` with the filename of the built zip.
  * remove zip if `factorio.package.removeZipAfterPublish` is set

## JSON Validation

JSON Validation and Intellisense is provided for all of Factorio's JSON files:
  * Mod `info.json`
  * Scenario and Campaign `description.json`
  * Locale `info.json`
  * `map-settings.json`
  * `map-gen-settings.json`
  * `server-settings.json`

## Changelog support

Language support including syntax highlighting, document outline, and linting.

## Locale support
Language support including syntax highlighting and document outline.

## String Interpolation

Logpoint expressions, `__DebugAdapter.print()`,  and `__debugline` strings will evaluate expressions in `{}`. The inner expression is evaluated as lua code, and has access to all locals and upvalues at the current location (for logpoints), or members of the current object and the object itself as `self` (for `__debugline`). The expression always has access to globals. `{[}` and `{]}` can be used to emit literal `{` and `}`.

## Debug Print

The function `__DebugAdapter.print(expr,alsoLookIn)` can be used to print messages to the vscode debug console. `expr` is string interpolation expression with access to locals at the scope that calls `print()`, and fields in table-like object `alsoLookIn`. The expression `{...}` will expand to the list of the caller's varargs, if any.

## Manual Breakpoints

If normal breakpoints are unusable for some reason, you can call `__DebugAdapter.breakpoint(mesg:LocalisedString)` to break. If `mesg` is specified, it is displayed in the editor like an exception.

## Terminate Session

`__DebugAdatper.terminate()` can be used to terminate a debug session from mod code.

## Simulate Events

`__DebugAdapter.raise_event(event:defines.events|number|string,data:EventData,modname:string)` can be used to call event handlers directly for testing. `data` is not validated, so you must ensure it is a well-formed event payload for `event` yourself. All event and custom-input handlers are raisable, even those not raisable through `script`.

## Custom Debug Views

When displaying tables in the Variables window, the debugger will check for metatables, and display them as a special member `<metatable>`. The default lineitem for a table can be overridden by the metamethod `__debugline`, which can be either a string (with expressions in `{}` interpolated) or a function which takes the table as an argument and returns a string. The typename for a table can be overridden by a string in the metatable field `__debugtype`. The contents of the table can be overridden by the `__debugchildren` metamethod, which can be `false` to disable expanding children or a function which takes the table as an argument and returns `DebugAdapter.Variable[]`.

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

Additionally, if using [hediet.debug-visualizer](https://marketplace.visualstudio.com/items?itemName=hediet.debug-visualizer), you can configure it to use `"context": "visualize"` to get json output on its eval requests. You must provide your own object conversions to produce objects compatible with the visualizer interface types. If the eval result has a `__debugvisualize(self)` metamethod, it will be called automatically before being converted to json.

## Ignore Functions in Stepping

Functions can be excluded from stepping with `__DebugAdapter.stepIgnore(func)` or `__DebugAdapter.stepIgnoreAll(table)`.

## Support the Debugger

[<img height='36' style='border:0px;height:36px;' src='https://az743702.vo.msecnd.net/cdn/kofi2.png?v=2' border='0' alt='Buy Me a Coffee at ko-fi.com'/>](https://ko-fi.com/X8X41IE4T)
