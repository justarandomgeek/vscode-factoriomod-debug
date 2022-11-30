## Sumneko Lua LSP integration

FMTK provides a third party library package for the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server which provides various adaptations to Factorio's Lua environment. The VS Code extension will automatically install this when a Factorio version is selected, or it can be generated manually with `fmtk sumneko-3rd`.

In addition to the runtime-api docs (generated from [`runtime-api.json`](https://lua-api.factorio.com/latest/json-docs.html)), this package includes several static library files, configuration settings and a sumneko plugin that enables enhanced handling of `require`, `global`, event handlers, and `remote` interfaces.


### Runtime API Docs

Factorio's [`runtime-api.json`](https://lua-api.factorio.com/latest/json-docs.html) is used to generate class definitions for most of the runtime API.

Event payload types are generated as subclasses of the generic event payload `EventData`, named like `EventData.on_event_name`.

Some types in the API have multiple definitions for the same type name, especially Concepts which accept both named-keys tables or array-like tables. In these cases the type will be a union of the set of definions, with the subtypes named `TypeName.0`, `TypeName.1`, etc.

In addition to the types listed in the json, a few extra related types are defined:
 * `LuaObject.object_name`: Union of all LuaObject class names seen in the json.
 * `BlueprintCircuitConnection`, `BlueprintControlBehavior`: Concepts referenced by the json but not present in it. These are included in the static libraries.

### Libraries

Factorio [modifies some builtin libraries](https://lua-api.factorio.com/latest/Libraries.html), and this package includes corresponding modified definitions for those libraries.

Type definitions are also included for some of the libraries included in `__core__/lualib`, such as `util` and `mod-gui`.

### Configuration

The VS Code extension will automatically configure `"Lua.workspace.userThirdParty"` when installing this package, as well as updating `"Lua.workspace.library"` with a link to `/data` in the selected version.

### Plugin Features

Because Factorio mods run in [several Lua VMs](https://lua-api.factorio.com/latest/Data-Lifecycle.html), some functions have behavior that the Language Server cannot understand with just type definitions, we provide special handling by transforming them before the Language Server sees them.

#### `require()`

Factorio allows requiring files from another mod with a `__modname__` prefix:
```lua
require("__modname__.filename")
```

The underscores are removed from these, allowing the Language Server to properly locate files if the modname matches a directory in the workspace (or libraries).

#### `global`

Each mod has its own private version of [the global named `global`](https://lua-api.factorio.com/latest/Global.html). To allow the Language Server to see this separation, `global` is renamed to `__modname__global` when used as the base variable in indexing or the target of assignment.

#### Event Handlers

When inline functions are used as event handlers, a `@param` tag will be automatically inserted for the event-specific payload type, to make all the event fields visible.

#### `remote` interfaces

Because `remote` interfaces are registered and called through separate APIs, the Language Server can't make the appropriate connections to provide signature help when calling. To address this, `remote.call` and `remote.add_interface` are transformed to appear as direct access through a virtual table:

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
remote.__all_remote_interfaces.foo = ({
  ---@param hello string
  ---@param world string
  ---@return number
  bar = function(hello, world)
    return 42
  end,
})

remote.__all_remote_interfaces.foo.bar("arg 1", "arg 2")
```

#### LuaObject Type Tests

To allow the Language Server to see that `LuaObject.object_name` is "like `type()`" for type tests, such as `if obj.object_name == "LuaPlayer" then end`, the plugin rewrites it to appear as an internal function `if __object_name(obj) == "LuaPlayer" then end`, and this function is marked as "like `type()`" in the configuration.