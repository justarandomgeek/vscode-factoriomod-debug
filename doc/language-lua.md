## Sumneko Lua LSP integration

FMTK provides a third party library package for the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server which provides various adaptations to Factorio's Lua environment. The VS Code extension will automatically install this when a Factorio version is selected, or it can be generated manually with `fmtk sumneko-3rd`.



<!-- The following settings will be automatically configured:
  * `"Lua.diagnostics.globals"` will have entries added for variables not presently covered by the generated files (this list will change over time as docs expand):
    * `mods`
    * `table_size`
    * `log`
    * `localised_print`
    * `serpent`
    * `global`
    * `__DebugAdapter`
    * `__Profiler`
  * `"Lua.runtime.version"` will be set to `"Lua 5.2"`
  * `"Lua.workspace.library"` will be automatically updated with `/data` and `/data/core/lualib` links to the selected version, as well as the folder containing generated docs.

Further advanced language features are also enabled by [the Factorio Sumneko Lua Plugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) which may be additionally installed in conjunction with these files to improve handling of `require`s, `global`, `on_event` and `remote.call`. -->
