# Setting up your workspace for Modding

A lot of people ask how to set up a workspace when they first start modding, so I thought I'd write down some of the repeated answers I give. This isn't the only way to do things, but this is how I do it, and I find it works pretty well.

## Workspace Layout

I open the Factorio `mods` directory as the root of my workspace in VSCode, and check out each mod's git repo directory into that. This simplifies debugger config as it is able to detect `mod-list.json` in the workspace and automatically configure all unspecified `modsPath`s in `launch.json`.

  * `mods/`
    * `.vscode/`
      * `launch.json`
      * `settings.json`
      * `lua/plugin.lua`
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
 * ~~[Factorio Lua API autocomplete](https://marketplace.visualstudio.com/items?itemName=svizzini.factorio-lua-api-autocomplete)~~ This has not been updated in some time and is no longer needed.
 * A Lua Language server. There's like 30 of these, but the one I like is [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua)
 * [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer). Enables viewing files inside zips, which allows breakpoints/stepping inside them as well.
 * Optional: [Bracket Pair Colorizer 2](https://marketplace.visualstudio.com/items?itemName=CoenraadS.bracket-pair-colorizer-2). Useful for deeply nested tables/function calls.
 * Optional: [indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow)
 * Optional: [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph). I happen to like the graph git log view this extension gives as a place to do manual git operations more complicated than the builtin SCM view provides for.

To generate EmmyLua docs for the Factorio API from the JSON docs press `Ctrl-Shift-P` to open the command palette and run the `Factorio: Generate Typedefs` command. Open `factorio/doc-html/runtime-api.json`, and save the generated lua file wherever you like. This will also offer to add it to the library and adjust other configuration for [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua).


Install [the Factorio Sumneko Lua Plugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) into `.vscode/lua` to improve handling of `require`s, `global`, and `remote.call`.



If using tasks, you may want to use git-bash as your automation shell:

```jsonc
  "terminal.integrated.automationShell.windows": "C:/Program Files/Git/usr/bin/bash.exe",
```
