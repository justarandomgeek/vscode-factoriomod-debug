## Sumneko Lua LSP integration

FMTK provides a third party library package for the [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) language server which provides various adaptations to Factorio's Lua environment. The VS Code extension will automatically install this when a Factorio version is selected, or it can be generated manually with `fmtk sumneko-3rd`.

In addition to the runtime-api docs (generated from [`runtime-api.json`](https://lua-api.factorio.com/latest/json-docs.html)), this package includes several static library files, configuration settings and a sumneko plugin that enables enhanced handling of `require`, `global`, `on_event` handlers, and `remote` interfaces.


### Runtime API Docs

Factorio's [`runtime-api.json`](https://lua-api.factorio.com/latest/json-docs.html) is used to generate class definitions for most of the runtime API.

Event payload types are generated as subclasses of the generic event payload `EventData`, named like `EventData.on_event_name`.

Some types in the API have multiple definitions for the same type name, especially Concepts which accept both named-keys tables or array-like tables. In these cases the type will be a union of the set of definions, with the subtypes named `TypeName.0`, `TypeName.1`, etc.

In addition to the types listed in the json, a few extra related types are defined:
 * `LuaObject.object_name`: Union of all LuaObject class names seen in the json.
 * `BlueprintCircuitConnection`, `BlueprintControlBehavior`: Concepts referenced by the json but not present in it. These are included in the static libraries.

### Libraries




### Configuration



### Plugin Features


<!--
  * `"Lua.workspace.library"` will be automatically updated with a `/data` link to the selected version,
-->
