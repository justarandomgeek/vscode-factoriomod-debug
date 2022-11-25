
# Introduction

This is a plugin for the [sumneko.lua](https://github.com/sumneko/lua-language-server) vscode extension to help with factorio related syntax and intellisense.

To keep up with this project check the [changelog](changelog.md).

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

Since `sumneko.lua` 2.0.0 `Lua.runtime.plugin` defaults to `""` instead of `".vscode/lua/plugin.lua"`
so you'll have to configure this setting to `".vscode/lua/plugin.lua"` yourself. Best would be to do this per workspace for security.

After installing make sure to reload vscode.

## How to update

To update the plugin simply use `git pull`. The master branch should always be in a functional state.

- In vscode right click on your `.vscode/lua` folder and click `Open in Integrated Terminal`.
- In the terminal run:
```powershell
git pull
```
Or use any other method of using git you're comfortable with.

After updating make sure to reload vscode.

## But i'm different

If you happen to have a different setup and cannot put the repository in its default location, clone it to wherever you want (the folder does not have to be called `lua` anymore at that point) and then configure the `Lua.runtime.plugin` setting. The file name of the plugin entrypoint is `plugin.lua`. It can be a relative path from the root of the workspace directory. (Best would be to do this per workspace for security.)

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

## Event Handler Parameter Annotating

When using generated EmmyLua docs for the Factorio API from the JSON docs ([such as mentioned in this section](https://github.com/justarandomgeek/vscode-factoriomod-debug/blob/master/workspace.md#editor--extensions)) the plugin can help reduce how many type annotating you have to write manually by automatically adding type annotations for event handler parameters withing `script.on_event` calls (or the other 2 variants from [flib](https://factoriolib.github.io/flib/modules/event.html) or [Stdlib](http://afforess.github.io/Factorio-Stdlib/modules/Event.Event.html)). This also works with an array of event names.

If you ever want or need this to be disabled for a specific event handler put `--##` somewhere after the parameter name of the handler but before the end of line. This may be required when annotating custom event handlers, see in the examples below.

The specific behavior is hard to put in words but i shall try:\
For all calls to `on_event`, `event.register` or `Event.register` it gets all event names a handler is being registered for which is either just the single one provided or the list of event "names". It then gets the parameter name used for the event data in the handler function provided (it only works when the function is defined in place, not for references to a previously defined function) and it adds an `@param` annotation for this parameter. For every event name previously found it tries to get the type name to use for this annotation by getting the last part in the indexing chain/expression and combines then with a `|` between each of them to tell the language server that it could be any of those given types, but it will only use the types that start with `on_` or `script_`.

`flib` and `stdlib` add another way of registering handlers, such as `event.on_tick(function(e) end)`. These are much easier to explain:\
It searches for `event.` or `Event.` followed by an identifier which gets called with a function being passed in as the first argument. Then it adds the annotation just as before by getting the parameter name used for the event data for the handler and adds an `@param` annotation for this parameter using the found function name (the identifier after `event.` or `Event.`) as the type name for the parameter without any further filtering on the name.

It doesn't do anything if it finds `--` somewhere in the line before whichever call it is processing.

It disables `undefined-doc-name` diagnostics on the `@param` annotation line because it can find false positives or one might not be using the generated EmmyLua docs.

For example
```lua
script.on_event(defines.events.on_tick, function(event)
  print("Hello World!")
end)

event.register(defines.events.on_built_entity, function(e) end)

Event.on_built_entity(function(e) end)
```
Would look something similar to this to the language server
```lua
script.on_event(defines.events.on_tick,
---@diagnostic disable-next-line:undefined-doc-name
---@param event EventData.on_tick
function(event)
end)

event.register(defines.events.on_built_entity,
---@diagnostic disable-next-line:undefined-doc-name
---@param e EventData.on_built_entity
function(e) end)

Event.on_built_entity(
---@diagnostic disable-next-line:undefined-doc-name
---@param e EventData.on_built_entity
function(e) end)
```

For example
```lua
script.on_event({
  defines.events.script_raised_built,
  defines.events.on_built_entity,
}, function(event)
end)

event.register({
  defines.events.script_raised_built,
  defines.events.on_built_entity,
}, function(e) end)
```
Would look something similar to this to the language server
```lua
script.on_event({
  defines.events.script_raised_built,
  defines.events.on_built_entity,
},
---@diagnostic disable-next-line:undefined-doc-name
---@param event EventData.script_raised_built|EventData.on_built_entity
function(event)
end)

event.register({
  defines.events.script_raised_built,
  defines.events.on_built_entity,
},
---@diagnostic disable-next-line:undefined-doc-name
---@param e EventData.script_raised_built|EventData.on_built_entity
function(e) end)
```

For example
```lua
script.on_event("on_tick", function(event)
end)

script.on_event(on_custom_event, function(event)
end)

---@param event my_on_custom_event_type
script.on_event(on_custom_event, function(event) --##
end)
```
Would look something similar to this to the language server
```lua
script.on_event("on_tick", function(event)
end)

script.on_event(on_custom_event,
---@diagnostic disable-next-line:undefined-doc-name
---@param event EventData.on_custom_event
function(event)
end)

---@param event my_on_custom_event_type
script.on_event(on_custom_event, function(event) --##
end)
```

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
remote.__all_remote_interfaces.foo = ({
  ---Hello World!
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.__all_remote_interfaces.foo.bar("arg 1", "arg 2")
```

Then when you for example hover over the string `"bar"` in the `remote.call` call you should get intellisense showing the signature of the function bar as defined above.

It also disables `undefined-field` diagnostics specifically for `__all_remote_interfaces` and does nothing if it finds `--` before `remote` on the same line.
