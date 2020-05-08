# Setting up your workspace for Modding

A lot of people ask how to set up a workspace when they first start modding, so I thought I'd write down some of the repeated answers I give. This isn't the only way to do things, but this is how I do it, and I find it works pretty well.

## Workspace Layout

I open the Factorio `mods` directory as the root of my workspace in VSCode, and check out each mod's git repo directoy into that. This simplifies debugger config as it is able to detect `mod-list.json` in the workspace and automatically configure all unspecified `modsPath`s in `launch.json`.

  * `mods/`
    * `.vscode/`
      * `launch.json`
      * `settings.json`
    * `modname_0.0.0/`
      * `.git/...`
      * `info.json`
      * ...
    * `anothermod_0.0.0/`
      * ...


## Editor & Extensions

I use VScode (imagine that!), but it needs a few extensions to really shine in this context:

 * [Factorio Mod Debugger](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) - You are here
 * [Factorio Lua API autocomplete](https://marketplace.visualstudio.com/items?itemName=svizzini.factorio-lua-api-autocomplete)
 * A Lua Language server. There's like 30 of these, but the one I like is [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua)
 * [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer) - Enables viewing files inside zips, which allows breakpoints/stepping inside them as well.
 * ~~Optional: [Bracket Pair Colorizer 2](https://marketplace.visualstudio.com/items?itemName=CoenraadS.bracket-pair-colorizer-2). Useful for deeply nested tables/function calls.~~ This has gotten unreliable lately and just stops working sometimes.
 * Optional: [indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow)
 * Optional: [vscode-lua-format](https://marketplace.visualstudio.com/items?itemName=Koihik.vscode-lua-format) - You can configure it via ``"vscode-lua-format.configPath": "/path/to/lua-format",``. All config options are listed [here](https://github.com/Koihik/LuaFormatter/blob/master/docs/Style-Config.md).
 * Optional: [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph). I happen to like the graph git log view this extension gives as a place to do manual git operations more complicated than the builtin SCM view provides for.


In addition to these, you'll want a little configuration to tell your Lua Language Server about Factorio's APIs. If you use `sumneko.lua`, add this to your (user or workspace) `settings.json`:

```jsonc
  "Lua.diagnostics.globals": [
    "game",
    "script",
    "remote",
    "commands",
    "settings",
    "rcon",
    "rendering",
    "global",
    "log",
    "defines",
    "data", /* data */
    "mods", /* data */
    "serpent",
    "table_size",
    "bit32",
    "util",
    /* data stage has a *lot* of globals,
     * you may need to add more if you use them
     */
    "circuit_connector_definitions", /* data */
    "universal_connector_template", /* data */
  ],
  "Lua.runtime.version": "Lua 5.2",
  "Lua.diagnostics.disable": [
    "lowercase-global"
  ],
  "Lua.workspace.library": {
    /* Adjust this to match your Factorio install path */
    "D:/factorio/factoriogit/data/core/lualib": true,
  },
```
