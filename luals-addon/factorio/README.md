
# Introduction

This is a plugin for the [sumneko.lua](https://github.com/sumneko/lua-language-server) vscode extension to help with factorio related syntax and intellisense.

To keep up with this project check the [changelog](changelog.md).

# Help, it broke!

If the plugin is causing the language server to report syntax errors when there really aren't any and you need a temporary "solution" before reporting the issue and waiting for a fix simply put `--##` at the very very start of the file. If it is a problem that it has to be at the very start of the file please create an issue with a reason/an example for it.

# Features

## Plugin Arguments

With `sumneko.lua` `3.5.1` the setting `Lua.runtime.pluginArgs` was added, which is an array of strings.

### `--ignore`

Tell the plugin to ignore the following paths which may be paths to files or directories, absolute or relative, where relative paths are relative to the root of the current workspace.

The paths following `--ignore` do not support any patterns, simply any file matching a path in the list, or any file inside a matching directory will be ignored.

I'm not entirely sure if you must use `\` as separators on windows, it might actually works with both `/` or `\`.

This example will ignore all files in the directory `foo/bar` and the file `bat.lua`:

```json
{
  "Lua.runtime.pluginArgs": [
    "--ignore",
    "foo/bar",
    "bat.lua",
  ],
}
```

## Introduction

What the plugin fundamentally does is make the lua extension (to which i'll refer to as lua language server) think files look different than they actually do. This allows for the language server to understand custom syntax, which factorio doesn't have a lot of, but it does help with a few things.

## Cross mod require

In factorio to require files from other mods you use
```lua
require("__modname__.filename")
```
however the folder `__modname__` does not exist, which means the language server cannot find the file and cannot assist you with any kind of intellisense, mainly to know what the file returns and to navigate to definitions and find references.

The plugin makes these look like this to the language server
```lua
require("modname.filename")
```
That means if there is a folder with the name `modname` it can now find the files.

(This might get improved to support folders with version numbers at the end. Zips may currently not even be possible with the extension, however it _might_ get support at some point too.)

## Factorio global

If the language server sees multiple mods it can happen that it thinks your `global` contains keys/data it really doesn't because some other mod stores said data in global. For that reason the plugin tries its best to make `global` look like `__modname__global` to the language server.

### Note

In order to not touch the wrong things it only replaces those where `global` is followed by `.` (a dot), `[` (open square bracket) or `=` (equals).

## Remotes

To help with intellisense for remotes, such as go to definition or knowing about which parameters a remote interface function takes and what it returns the plugin makes `remote.call` and `remote.add_interface` calls look different to the language server.

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
remote.__typed_interfaces.foo = ({
  ---Hello World!
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.__typed_interfaces.foo.bar("arg 1", "arg 2")
```

Then when you for example hover over the string `"bar"` in the `remote.call` call you should get intellisense showing the signature of the function bar as defined above.

It also disables `undefined-field` diagnostics specifically for `__typed_interfaces` and does nothing if it finds `--` before `remote` on the same line.

## LuaObject type narrowing

A little disclaimer: For this to work one must have the `Lua.workspace.userThirdParty` setting pointing at a folder containing generated type annotations for factorio which also includes a `config.lua` file for `sumneko.lua` to understand that the internal function used by the plugin `__object_name` is similar to `type` as in it is able to narrow the type of a variable that is checked in an if statement, like `if type(foo) == "string" then --[[foo is a string here]] end`.

This adds support to do `if foo.object_name == "LuaPlayer" then end` which then tells the language server that `foo` is actually a `LuaPlayer`, not just a generic `LuaObject` inside of the if statement.

For example
```lua
---@type LuaObject
local foo

if foo.object_name == "LuaPlayer" then
  game.print(foo.name)
end
```
Would look something similar to this to the language server
```lua
---@type LuaObject
local foo

if __object_name(foo) == "LuaPlayer" then
  game.print(foo.name)
end
```

It does nothing if `foo` is preceded by a `.` (dot) nor the keyword `function`, and does nothing if `--` is anywhere before the expression.


## In Game Commands

Any of the following at the start of a line will be removed by the plugin allowing you to write full factorio commands in files without syntax errors.

- `/command`
- `/c`
- `/silent-command`
- `/sc`
- `/measured-command`

The lua context specifier `__modname__` following any of the above is also removed when present.

For example
```lua
/c game.print("Hello world!")
/sc game.speed = 10
/c __my_mod__ game.print(serpent.block(global.foo))
```
Would look something similar to this to the language server
```lua
game.print("Hello world!")
game.speed = 10
game.print(serpent.block(global.foo))
```
