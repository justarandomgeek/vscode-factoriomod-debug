
## Additional Lua Diagnostics

The debugger also injects runtime diagnostics into all hooked mods:

  * Global Assignment: A warning will be issued on the first assignment to an undefined global variable. `__DebugAdapter.defineGlobal(name)` can be used to disable this warning for the given name.

## Factorio API autocompletion

Sumneko EmmyLua docs and workspace settings for the Factorio API will be automatically generated when selecting a Factorio version for debugging. Together with the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server, this enables autocompletion and other language server features for the Factorio API.

You can configure the generation location with the setting `"factorio.workspace.library"`. Note that if you place these outside the workspace you will also need to add this folder to `"Lua.workspace.library"` as well for them to be loaded.

The following settings will be automatically configured:
  * `"Lua.diagnostics.globals"` will have entries added for variables not presently covered by the generated files (this list will change over time as docs expand):
    * `mods`
    * `table_size`
    * `log`
    * `localised_print`
    * `serpent`
    * `__DebugAdapter`
    * `__Profiler`
  * `"Lua.runtime.version"` will be set to `"Lua 5.2"`

Further advanced language features are also enabled by [the Factorio Sumneko Lua Plugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) which may be additionally installed in conjunction with thes files to improve handling of `require`s, `global`, `on_event` and `remote.call`.

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

Language support including syntax highlighting, document outline, and linting.

