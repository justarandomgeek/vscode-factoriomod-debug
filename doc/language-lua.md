# LuaLS (Sumneko) LSP integration

FMTK provides a third party library package for the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server which provides various adaptations to Factorio's Lua environment. The VS Code extension will automatically install this when a Factorio version is selected, or it can be generated manually with `fmtk sumneko-3rd`.

In addition to the docs (generated from [`runtime-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-runtime.html) and [`prototype-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-prototype.html)), this package includes several static library files, configuration settings and a luals plugin that enables enhanced handling of `require`, `global`, event handlers, and `remote` interfaces.

## API Type Definitions

Factorio's [`runtime-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-runtime.html) and [`prototype-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-prototype.html) are used to generate type definitions for most of the API.

Enum values from `defines` are generated as opaque typed enum values. Each enum is a type named as itself (such as `defines.events`), as is each value (such as `defines.events.on_built_entity`). This allows function overload resolution to correctly resolve enum values.

Event payload types are generated as subclasses of the generic event payload `EventData`, named like `EventData.on_event_name`. Overloads for `script.on_event` are generated with corresponding handler and filter types. A library definition for `event_handler` is also generated.

Some types in the Runtime API have multiple definitions for the same type name, especially Concepts which accept both named-keys tables or array-like tables. In these cases the type will be a union of the set of definions, with the subtypes named `TypeName.0`, `TypeName.1`, etc.

Types from the Prototype API are prefixed `data.` to separate the namespaces, since several type names would conflict otherwise. Prototype Concept types with multiple definitions have a named class subtype suffixed `.struct` as well as the main alias type (usually a union).

In addition to the types listed in the json, a few extra related types are defined:
 * `LuaObject.object_name`: Union of all LuaObject class names seen in the json.
 * `BlueprintCircuitConnection`, `BlueprintControlBehavior`: Concepts referenced by the json but not present in it. These are included in the static libraries.

## Libraries

Factorio [modifies some builtin libraries](https://lua-api.factorio.com/latest/auxiliary/libraries.html), and this package includes corresponding modified definitions for those libraries.

Type definitions are also included for some of the libraries included in `__core__/lualib`, such as `util` and `mod-gui`.

## Configuration

The VS Code extension will automatically configure `"Lua.workspace.userThirdParty"` when installing this package, as well as updating `"Lua.workspace.library"` with a link to `/data` in the selected version.

## Plugin Features

Because Factorio mods run in [several Lua VMs](https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html), some functions have cross-VM behavior that cannot be described fully with type definitions. We handle these by providing a plugin which transforms them into a more easily understood form before the Language Server sees them.

### Plugin Disabling

The plugin isn't perfect, so whenever it does something undesirable use `---@plugin ...` to disable it. It works very similar to `---@diagnostic`, for example: `---@plugin disable-line: object_name` or `---@plugin disable-next-line`.

### `require()`

Factorio allows requiring files from another mod with a `__modname__` prefix:
```lua
require("__modname__.filename")
```

The underscores are removed from these, allowing the Language Server to properly locate files if the modname matches a directory in the workspace (or libraries).

Additionally, in require paths with slashes, Factorio replaces any file extension with `.lua`. To match this, the extensions of any slashed paths are stripped, allowing the Language Server to correctly locate files with its default search pattern of `?.lua`. The second default of `?/init.lua` is removed from configuration, because factorio does not look for this.

### `global`

Each mod has its own private version of [the global named `global`](https://lua-api.factorio.com/latest/auxiliary/global.html). To allow the Language Server to see this separation, `global` is renamed to `__modname__global` when used as the base variable in indexing or the target of assignment.

### `remote` interfaces

Because `remote` interfaces are registered and called through separate API functions, the Language Server can't make the appropriate connections to provide signature help when calling. To address this, `remote.call` and `remote.add_interface` are transformed to appear as direct access through a virtual table `__typed_interfaces`:

```lua
remote.add_interface("foo", {
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.call("foo", "bar", "arg 1", "arg 1")
```
Would appear to the Language Server as
```lua
remote.__typed_interfaces.foo = ({
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.__typed_interfaces.foo.bar("arg 1", "arg 2")
```

### LuaObject Type Tests

To allow the Language Server to see that `LuaObject.object_name` is "like `type()`" for type tests, such as `if obj.object_name == "LuaPlayer" then end`, the plugin rewrites it to appear as an internal function `if __object_name(obj) == "LuaPlayer" then end`, and this function is marked as "like `type()`" in the configuration.

### Commands

In-game lua commands `/c`, `/command`, `/silent-command`, `/sc`, and `/measured-command` will be ignored at the start of any line, including the optional `__modname__` designator if present.
