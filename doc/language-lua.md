# EmmyLua LSP integration

FMTK provides a library package for the EmmyLua language server ([tangzx.emmylua](https://marketplace.visualstudio.com/items?itemName=tangzx.emmylua), [xuhuanzy.emmylua-luals](https://open-vsx.org/extension/xuhuanzy/emmylua-luals)) for Factorio's Lua environment. The VS Code extension will automatically install this when a Factorio version is selected, or it can be generated manually with `fmtk docs`.

In addition to the docs (generated from [`runtime-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-runtime.html) and [`prototype-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-prototype.html)), this package includes several static library files, and applies default configuration settings that enable enhanced handling of `require`, `storage`, event handlers, and `remote` interfaces.

## API Type Definitions

Factorio's [`runtime-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-runtime.html) and [`prototype-api.json`](https://lua-api.factorio.com/latest/auxiliary/json-docs-prototype.html) are used to generate type definitions for most of the API. If enabled (`factorio.docs.usePrototypeDumps`), prototype information from `data-dump.json` and `settings-dump.json` in the selected installation's script-output will be used as well, to list known names and types (settings, mod-data) of defined prototypes.

Enum values from `defines` are generated as opaque typed enum values. Each enum is a type named as itself (such as `defines.events`), as is each value (such as `defines.events.on_built_entity`). This allows function overload resolution to correctly resolve enum values.

Event payload types are generated as subclasses of the generic event payload `EventData`, named like `EventData.on_event_name`. Overloads for `script.on_event` are generated with corresponding handler and filter types. A library definition for `event_handler` is also generated.

Some types in the Runtime API have multiple definitions for the same type name, especially Concepts which accept both named-keys tables or array-like tables. In these cases the type will be a union of the set of definions. If the first member is a table, it will be `TypeName.struct`, otherwise the subtypes (if named) will be named `TypeName.${i}` where `i` is the index in the union.

Types from the Prototype API are in the namespace `data`. Prototype Concept types with multiple definitions have a named class subtype suffixed `.struct` as well as the main alias type (usually a union).

In addition to the types listed in the json, a few extra related types are defined:
 * `LuaObject.object_name`: Union of all LuaObject class names seen in the json.

When using prototype dumps, the following additional types are generated:
  * `data.ThingID` get a corresponding `data.ThingName` for the union of `string` and all known specific names. Runtime `ThingID` union types have the corresponding `data.ThingName` inserted as well.
  * `on_event` and `event_handler` distinguish event name strings between CustomEvent and CustomInputEvent
  * LuaPrototypes dicts are populated with known names
    * in `LuaPrototypes.mod_data`, the value of `data_type` is used as the EmmyLua typename for `data`, if set
    * in `LuaPrototypes.mod_settings`, the setting type is populated as well
  * names and types in `settings` are populated

## Libraries

Factorio [modifies some builtin libraries](https://lua-api.factorio.com/latest/auxiliary/libraries.html), and this package includes corresponding modified definitions for those libraries.

Type definitions are also included for some of the libraries included in `__core__/lualib`, such as `util` and `mod-gui`.

## Configuration

The VS Code extension will automatically configure `.luarc.json` in the workspace when installing this package. The vscode setting `factorio.workspace.manageLibraryDataLinks` controls if this includes a link to the `/data` tree of the selected installation.

## Troubleshooting

If these functions are not working properly, try re-running the version selector, or running `Factorio: Check Config` and resolving any warnings. If that still doesn't resolve the issue, delete `.luarc.json` in the workspace and re-run the version selector again.

### `require()`

Factorio allows requiring files from another mod with a `__modname__` prefix:
```lua
require("__modname__.filename")
```
In require paths with slashes, Factorio also replaces any file extension with `.lua`.

The generated `.luarc.json` file has `moduleMap` and `requirePattern` confugired to handle these variations. If your workspace is not the root `/mods` folder, you may want to add the `/mods` folder as a library path in `emmyrc.json` to allow resolving mod names.

### `storage`

Each mod has its own private version of [`storage`](https://lua-api.factorio.com/latest/auxiliary/storage.html).

EmmyLua is not aware of the separations, and needs some hints to handle this well. For best results, include an assignment like

```lua
-- using a namespace is optional, but saves you having to keep the `Storage` name unique per-mod
---@namespace YourMod

---@type Storage
storage = storage --[[@as Storage]]
```
at the top of every file using `storage` to tag its class for that file. This sets both the declared type (`@type`) and the observed/'actual' type (`@as`) so that it will deduce correctly for the rest of the file. Define the `YourMod.Storage` class as normal.

### `remote` interfaces

To provide type signatures for remote interfaces, register your interface class as a member of the partial class LuaRemote.InterfaceMap:


```lua
---@class (partial) LuaRemote.InterfaceMap
---@field silo-script SiloScript.RemoteInterface

-- using a namespace is optional, but if used, the partial `LuaRemote.InterfaceMap` must be *outside* the namespace
---@namespace SiloScript

---@class RemoteInterface
---@field set_no_victory fun(b:boolean)
---@field get_no_victory fun():boolean
```
