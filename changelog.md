
### 2022-11-25
- Simplify `remote.add_interface` to no longer require removal of the closing `)`
- Remove "Normalize Require" from the readme, it was already removed on `2022-08-15`

### 2022-11-21
- Remove internal hack for multi file plugins since it now supported by `sumneko.lua` itself (since somewhere around `3.5.1`)

### 2022-10-31
- Change on_event to never consider `on_configuration_changed` to be an event, because it is not registered through `script.on_event`

### 2022-09-23
- Fix plugin race condition when first opening a workspace
- Add `--ignore` pluginArg to tell the plugin to ignore files or directories

### 2022-08-15
- Update for `sumneko.lua` `>= 3.4.1` (best would be to use `>= 3.5.0`, see entry about `---@typelist` below)
- Drop support for `sumneko.lua` `2.x`
- Remove `require` path separator normalization as it is not handled by `sumneko.lua` itself
- Remove `---@narrow` as `sumneko.lua` now has `---@cast foo Bar` and `--[[@as Bar]]`
- Remove `---@typelist` as `sumneko.lua` `3.5.0` supports type lists for `---@type`
- Merge PR#3 by Nexela: https://github.com/JanSharp/FactorioSumnekoLuaPlugin/pull/3
- Fix missing `EventData.` prefix for `on_event` calls with multiple defines in a table

### 2022-07-25
- Fix `global` not getting replaced when having `..` (concat operator) before it

### 2022-07-21
- Fix `global` not getting replaced when having a `.` (dot) as the last character on the previous line in a comment

### 2022-07-09
- Update internal plugin hack for `sumneko.lua` `> 3.4.2`
- "Properly" fix fallback modname resolution

### 2022-07-08
- Hack fix fallback modname resolution erroring

### 2022-07-05
- Add fallback modname resolution which is using the workspace folder name for `global` when the file uri does not contain `mods/modname/`

### 2022-04-17
- Fix the usage of `global` causing a `lowercase-global` diagnostic warning on the first line if the current mod name is lowercase

### 2022-01-24
- Fix broken `require`, `global` and potentially even `remote`, cause by an incomplete performance improvement. Sorry, my bad
- Add support for `sumneko.lua` `< 2.6.0`, since I broke the plugin pre `2.6.0`

### 2022-01-20
- Update for internal changes in `sumneko.lua` `2.6.0`, this version of the plugin is not compatible with `< 2.6.0`

### 2022-01-01
- Fix `settings.global` (or other indexing with `global` as the key) being replaced with `__modname__global`

### 2021-12-07
- Significantly improve performance on files with incredibly long lines (tens of thousands of characters)

### 2021-11-07
- Allow spaces between `---` and `@typelist` or `@narrow`
- Add note in readme that `---@narrow` does no longer work since `sumneko.lua` `2.4.0` and there is currently no other known workaround

### 2021-10-25
- Improve hack for `remote.add_interface` and `remote.call` for `sumneko.lua` `2.4.0` (to align identifiers/keys properly)

### 2021-10-23
- Use `CustomInputEvent` to the on_event param if it finds a string literal in the event names

### 2021-10-03
- Fix Event Handler Parameter Annotating causing `luadoc-miss-type-name` errors when the event "name" list contains no "valid" event class names

### 2021-07-30
- Fix `---@narrow` making the target variable look like a function. It makes it potentially `nil` instead
- Update readme to better reflect the current state of the plugin

### 2021-07-21
- Update for `sumneko.lua` `2.2.0` internal changes
- Improve readme grammar. I think.

### 2021-06-27
- Update readme to note to configure the `Lua.runtime.plugin` setting since that defaults to `""` instead of `".vscode/lua/plugin.lua"` since `sumneko.lua` `2.0.0`

### 2021-06-18
- Add Event Handler Parameter Annotating. See readme for explanation and exact behavior, though the latter may not be the most useful
- Fix "__all_remote_interfaces" `undefined-field` warnings for `remote.add_interface` and `remote.call` when `remote` has a specific type defined
- Hotfix commented out `remote.add_interface` and `remote.call` generating errors

### 2021-05-08
- Add ---@narrow to change the type of a variable

### 2021-03-08
- Implement remote.add_interface. See readme for potential quirks
- Add light support for ---@typelist being commented out
