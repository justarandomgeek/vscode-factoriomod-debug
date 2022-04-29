# Setting up your workspace for Modding

A lot of people ask how to set up a workspace when they first start modding, so I thought I'd write down some of the repeated answers I give. This isn't the only way to do things, but this is how I do it, and I find it works pretty well.

## Workspace Layout

I open the Factorio `mods` directory as the root of my workspace in VSCode, and check out each mod's git repo directory into that. This simplifies debugger config as it is able to detect `mod-list.json` in the workspace and automatically configure all unspecified `modsPath`s in `launch.json`.

  * `mods/`
    * `.vscode/`
      * `launch.json`
      * `settings.json`
      * `lua/plugin.lua`
      * `runtime-api.lua`
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

To provide Factorio Lua API autocompletion, the Factorio mod debugger extension generates EmmyLua docs from the Factorio JSON docs, which are then used by the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server for its autocompletion feature.
To generate EmmyLua docs for the Factorio API from the JSON docs, press `Ctrl-Shift-P` to open the command palette and run the `Factorio: Generate Typedefs` command. In the file picker, open `factorio/doc-html/runtime-api.json`, and save the generated Lua file in the `.vscode` folder. This command will also offer to add it to the library and adjust other configuration for [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua). If you don't take this offer, you will have to add the generated Lua file to your `settings.json` manually: Add `"Lua.workspace.library": [ "path/to/mods/.vscode/runtime-api.lua" ]` to your settings.json.

TODO Bilka: mention general manual settings.json setup for sumneko? Or if not, at least mention adding Factorio/data to the workspace libraries? (may only work well when using jans plugin?)

TODO Bilka: An example launch.json may be nice, or mention the Using Factorio Mod Debug section. I found the example that was on discord really useful starting out, since using the intellisense and editor features to generate things was very new to me. Like, what does the Factorio path need to point to etc.


Install [the Factorio Sumneko Lua Plugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) into `.vscode/lua` to improve handling of `require`s, `global`, `on_event` and `remote.call`.



If using tasks, you may want to use git-bash as your automation shell:

```jsonc
  "terminal.integrated.automationShell.windows": "C:/Program Files/Git/usr/bin/bash.exe",
```
