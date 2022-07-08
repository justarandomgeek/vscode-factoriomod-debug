
### 2022-07-09
- Update internal plugin hack for `sumneko.lua` `> 3.4.2`

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
