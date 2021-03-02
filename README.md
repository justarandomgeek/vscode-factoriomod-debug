
# Introduction

This is a plugin for the [sumneko.lua](https://github.com/sumneko/lua-language-server) vscode extension to help with factorio related syntax and intelisense.

# Installing and updating

## How to install - clone

To use this plugin clone this repository into your `.vscode/lua` folder:

- If you don't already have git installed, download it from [here](https://git-scm.com/).
- In vscode right click on your `.vscode` folder and click `Open in Integrated Terminal`.
- In the terminal run:
```powershell
git clone --single-branch --branch master https://github.com/JanSharp/FactorioSumnekoLuaPlugin.git lua
```
This will clone the master branch of this repository into the `lua` folder from the current directory, which is the `.vscode` directory.

## How to update

To update the plugin simply use `git pull`. The master branch should always be in a functional state.

- In vscode right click on your `.vscode/lua` folder and click `Open in Integrated Terminal`.
- In the terminal run:
```powershell
git pull
```
Or use any other method of using git you're comfortable with.

## But i'm different

If you happen to have a different setup and cannot put the repository in it's default location clone it to wherever you want (the folder does not have to be called `lua` anymore at that point) and then configure the `Lua.runtime.plugin` setting. The file name of the plugin entrypoint is `plugin.lua`. It can be a relative path from the root of the workspace directory.

### But i'm also very new

If you're new to command line programs and you cannot use the `Open in Integrated Terminal` in your case, simply use the `cd` "command" (i think it's called) in any command line to navigate to the directory you want to clone the repository into.

For example open a command line window or terminal of some kind (on windows i'd use `git bash` which comes with git. Just search for it in the start menu).
```
cd C:/dev/factorio/modding
git clone --single-branch --branch master https://github.com/JanSharp/FactorioSumnekoLuaPlugin.git
```
And to update:
```
cd C:/dev/factorio/modding/FactorioSumnekoLuaPlugin
git pull
```
(git bash doesn't like back slashes)
And if the workspace is at `C:/dev/factorio/modding` the `Lua.runtime.plugin` would be set to `FactorioSumnekoLuaPlugin/plugin.lua`, most likely as a workspace setting, not system wide setting.

# Help, it broke!

If the plugin is causing the language server to report syntax errors when there really aren't any and you need a temporary "solution" before reporting the issue and waiting for a fix simply put `--##` at the very very start of the file. **This method of telling the plugin to ignore a file might be changed in the future. This process has not been thought all the way through**.

# Features

## Introduction

What the plugin fundamentally does is make the lua extension (to which i'll refer to as lua language server) think files look different than they actually do. This allows for the language server to understand custom syntax, which factorio doesn't have a lot of, but it does help with a few things. 

## Cross mod require

In factorio to require files from other mods you use
```lua
require("__modname__.filename")
```
however the folder `__modname__` does not exist, which means the language server cannot find the file and cannot assist you with any kind of intelisense, mainly to know what the file returns and to navigate to definitions and find references.

The plugin makes these look like this to the language server
```lua
require("modname.filename")
```
That means if there is a folder with the name `modname` it can now find the files.

(This might get improved to support folders with version numbers at the end. Zips may currently not even be possible with the extension, however it _might_ get supoort at some point too.)

## Factorio global

If the language server sees multiple mods it can happen that it thinks your `global` contains keys/data it really doesn't because some other mod stores said data in global. For that reason the plugin tries it's best to make `global` look like `__modname__global` to the language server.

### Note

In order to not touch the wrong things it only replaces those where `global` is followed by `.` (a dot), `[` (open square bracket) or `=` (equals).

## Remotes

**!! `remote.add_interface` is not implemented yet !!**

To help with intelisense for remotes, such as go to definition or knowing about which parameters a remote interface function takes and what it returns the plugin makes `remote.call` and `remote.add_interface` calls look different to the language server.

For example
```lua
remote.add_interface("foo", {
  ---Hello World!
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.call("foo", "bar", "arg 1", "arg 1")
```
Would look something similar to this to the language server
```lua
remote.__all_remote_interfaces.foo = {
  ---Hello World!
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
}

remote.__all_remote_interfaces.foo.bar("arg 1", "arg 2")
```

Then when you for example hover over the string `"bar"` in the `remote.call` call you should get intelisense showing the signature of the function bar as defined above.
