# Setting up your workspace for Modding

A lot of people ask how to set up a workspace when they first start modding, so I thought I'd write down some of the repeated answers I give. This isn't the only way to do things, but this is how I do it, and I find it works pretty well.

## Workspace Layout

I open the Factorio `mods` directory as the root of my workspace in VSCode, and check out each mod's git repo directory into that. This simplifies debugger config as it is able to detect `mod-list.json` in the workspace and automatically configure all unspecified `modsPath`s in `launch.json`.

  * `mods/`
    * `.vscode/`
      * `launch.json`
      * `settings.json`
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

 * [Factorio Modding Tool Kit](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) - You are here
 * [sumneko Lua Language Server](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) Factorio Modding Tool Kit integrates with this to provide advanced lua features (autocomplete, type information, etc).
 * Optional: [indent-rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow) Because Lua doesn't use many brackets, it can be helpful to color indent levels instead.
 * Optional: [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph). I happen to like the graph git log view this extension gives as a place to do manual git operations more complicated than the builtin SCM view provides for.

Factorio Modding Tool Kit generates a library docs bundle from the Factorio JSON docs, which is then used by the [sumneko Lua Language Server](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) to provide advanced langauge features, such as API autocompletion and type checking. Click the Factorio version selection in the status bar to get started!

Don't forget to read [the readme](../readme.md) for more information about using the tools provided by Factorio Modding Tool Kit.