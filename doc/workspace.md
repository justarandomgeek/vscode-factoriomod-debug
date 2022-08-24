# Setting up your workspace for Modding

A lot of people ask how to set up a workspace when they first start modding, so I thought I'd write down some of the repeated answers I give. This isn't the only way to do things, but this is how I do it, and I find it works pretty well.

## Workspace Layout

I open the Factorio `mods` directory as the root of my workspace in VSCode, and check out each mod's git repo directory into that. This simplifies debugger config as it is able to detect `mod-list.json` in the workspace and automatically configure all unspecified `modsPath`s in `launch.json`.

  * `mods/`
    * `.vscode/`
      * `launch.json`
      * `settings.json`
      * `lua/plugin.lua`
      * `factorio/runtime-api-*.lua`
    * `modname/`
      * `.git/...`
      * `info.json`
      * `control.lua`
      * `data.lua`
      * ...
    * `anothermod/`
      * ...


## Editor & Extensions

I use [VScode](https://code.visualstudio.com/) (imagine that!), but it needs a few extensions to really shine in this context:

 * [Factorio Mod Debugger](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) - You are here
 * A Lua language server. I like to use [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua), the Factorio Mod Debugger has some extended support for it.
 * [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer). Enables viewing files inside zips, which allows breakpoints/stepping inside them as well.
 * Optional: [indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow)
 * Optional: [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph). I happen to like the graph git log view this extension gives as a place to do manual git operations more complicated than the builtin SCM view provides for.

To provide Factorio Lua API autocompletion, the Factorio mod debugger extension generates EmmyLua docs from the Factorio JSON docs, which are then used by the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server for its autocompletion feature. Click the Factorio version selection in the status bar to get started!

Install [the Factorio Sumneko Lua Plugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) into `.vscode/lua` to improve handling of `require`s, `global`, `on_event` and `remote.call`.

Don't forget to read [the readme](../readme.md) for information about using the Factorio Mod Debugger itself.