# Changelog

[<img height='36' style='border:0px;height:36px;' src='https://az743702.vo.msecnd.net/cdn/kofi2.png?v=2' border='0' alt='Buy Me a Coffee at ko-fi.com'/>](https://ko-fi.com/X8X41IE4T)

## 2.0.1
* LuaLS library package:
  * generate correct overloads for data.extend
  * double-update `Lua.workspace.userThirdParty` when installing to trigger a library reload even if `Lua.workspace.library` was untouched
* Debugger
  * Fix pause after threads request when unavailable

## 2.0.0
* Pre-release for Factorio 2.0
* LuaLS library package:
  * `factorio.workspace.manageLibraryDataLinks` default changed to false, removes link when set to false
* Locale
  * `__plural_for_parameter_x_` -> `__plural_for_parameter__x__`, new tags for 2.0
* Debugger
  * Fix missing properties on some classes

## 1.1.47
* Fix tasks broken by bundling changes

## 1.1.46
* Improved Neovim setup docs (#132)
* VSCode's migration to ESM interally breaks context detection and requires splitting the all-in-one bundle. Now separate bundles for cli/vscode/shared.
* LuaLS library package:
  * Add `data.ModSettingsPrototype` types for settings stage (#137)
  * Add support for Factorio JSON Docs v6 (Factorio >= 2.0)
  * Support generating from online docs (cli only for now)
* Debugger
  * Fix error when listing LuaObjects with `operator[]` but no `operator#`
  * Fix error when calling `__DebugAdapter.print(nil)`

## 1.1.45
* Debugger
  * Don't choke on metatables with broken metatables
  * Add `readOnly` to `RenderOptions` for custom variable views
* Locale:
  * Don't crash when diagnosing file with empty keys
* LuaLS library package:
  * Remove hard-coded defines.prototype list, they're included in the json docs starting from Factorio 1.1.110

## 1.1.44
* Debugger
  * Set `SteamAppId` when launching for `--version`
  * Fix Eval not available if not enough lua events running
  * Pin GC-able values from eval results or `__DebugAdapter.print(obj)` to allow expanding (some) fields when not paused
  * Display the registered name of metatables, if available
  * Fix possible race when adjusting settings at launch
* VSCode:
  * Check LuaLS plugin files in Check Config
  * Cleanup mismatched workspace links when updating `Lua.workspace.userThirdParty`
* LuaLS library package:
  * Plugin option `--ignore` to disable the plugin for certain files or folders
  * Plugin option `--clusterio-modules` to enable handling clusterio requires
  * Note that a bug in LuaLS 3.9.3 currently prevents passing more than one argument in some workspaces

## 1.1.43
* Locale:
  * Don't emit documentSymbols with empty names (#118)
  * Warn on key ending with whitespace
* PropertyTree: (mod settings, etc)
  * Correct saving mid-length (129-254) strings
* VSCode:
  * Use "Restart Extension Host" instead of "Reload Window" to restart the LuaLS (#119)
  * Trim whitespace off API keys (#117)
  * Set extensionDependency on LuaLS for easier installation
* Debugger:
  * Fixed some missing captures that could cause errors if mods overwrite Lua builtins
  * Fixed hang when attemping to debug simulations
  * Use `--version` to check the binary's version instead of relying on json version
  * Fixed that `on_nth_tick` hook could hide errors for some incorrect calls
* LuaLS library package:
  * Changed enums to generate typed values instead of `integer`
  * Generate overloads for `script.on_event`, removed plugin `on_event` module
  * Add Support for Factorio JSON Runtime Docs v5 (Factorio >= 1.1.108)
  * Remove Support for Factorio JSON Runtime Docs v3 (Factorio < 1.1.89)
  * Fill in `defines.prototypes` with dumped values instead of `{[string]:{[string]:0}}`
  * Include `.base` type in the union for `variant_parameter_groups` types

## 1.1.42
* Debugger:
  * Display each Lua VM as a DAP "Thread"
  * Selectively un-set hook when not stepping and no breakpoints active in file
* VSCode:
  * JSON Schema for migrations
* Sumneko library package:
  * Fixed that `---@plugin disable-line` would also affect the previous lines if they had comments
  * Improved plugin performance by ~500%. Unfortunately this isn't really noticeable, because other parts of the LuaLS take up much more time

## 1.1.41
* Sumneko library package:
  * correctly resolve `data-lifecycle` link in docs
  * Omit `MapGenPresets` from `AnyPrototype`, to reduce incorrect type deduction on data:extend's argument
  * Don't use `AnyPrototype` on versions that don't have it defined yet

## 1.1.40
* Sumneko library package:
  * Generate even if some doc links are broken
  * Correctly mark Attributes as optional
  * Set Lua.workspace.checkThirdParty=ApplyInMemory to work around LuaLS's broken defaults
  * Improved plugin's string and comment matching correctness and performance (#113)
  * Added ---@plugin annotation to selectively disable parts of the plugin. Very similar to how ---@diagnostic works
  * Correct type for `data:extend`'s argument (using `AnyPrototype` instead of `PrototypeBase`)
* Debugger:
  * Correctly update breakpoints when edited (conditions, log message)
  * Fixed that `__DebugAdapter.print()` and `log`, and logpoints would print messages with no trailing newline

## 1.1.39
* VSCode:
  * Added commands to adjust config.ini settings (prototype cache, mouse auto capture)
  * Check config.ini settings in Check Config
* Sumneko library package:
  * Correctly mark function optional table params
  * Fix `global` rename only being applied once per line

## 1.1.38
* Debugger:
  * Pass `SteamAppId` environment variable instead of trying to create `steam_appid.txt`
  * Removed `checkGlobals` warning on newly created variables
* VSCode:
  * Added Output channel for general logging and diagnostics
  * Added Check Config command (run from command pallete)
* Sumneko library package:
  * Updated library generator remaining runtime types
  * Split up table types with variant_parameter_groups for better diagnostics

## 1.1.37
* No longer use `keytar` which VSCode has removed.

## 1.1.36
* Debugger:
  * Fixed that fast bytecode dumps (1.1.33) would hang on some mods (for real this time)
* Sumneko library package:
  * Updated library generator for some runtime types (events, defines)

## 1.1.35
* Debugger:
  * Fixed that fast bytecode dumps (1.1.33) would hang on some mods
  * Added support for passing environment variables via launch configuration to spawned factorio process (#95)
* Sumneko library package:
  * Now generates prototype-api types
  * Disables `lowercase-global` diagnostic

## 1.1.34
* Add Support for Factorio JSON Runtime Docs v4 (Factorio >= 1.1.89)
* Remove Support for Factorio JSON Runtime Docs v1 and v2 (Factorio < 1.1.62)

## 1.1.33
* JSON Schema:
  * Mod name must be >3 and <50 characters
* Tasks:
  * Calculate changelog date only once
* Sumneko plugin:
  * Detect campaigns and tutorials for distinguishing `global`s
  * Added missing optional tag on various serpent options
* Debugger:
  * Changed how lua function dumps are passed for substantial speedup in data stage (~3x for `base`)

## 1.1.32
* Debugger:
  * Fixed error when attempting to map paths for zipped mods when zip handling not ready

## 1.1.31
* VSCode:
  * Fixed profiler path mapping
  * Fixed running Debugger in external process

## 1.1.30
* Debugger:
  * Fixed catching pcall/xpcall caught errors in settings & data stage
  * Adjust breakpoints at end of file back to last active line
  * Fixed some output events from lua not being emitted correctly
* VSCode:
  * Don't try to auto-detect attached debugger to debug forked processes (false positive on some systems)

## 1.1.29
* CLI:
  * Added `fmtk settings unset` to remove a mod setting
  * Various commands now set exitcode 1 when exiting with an error
* Changelog:
  * Fixed some CodeActions providing incorrect fix edits
* Debugger:
  * Abort launch when enabling `debugadapter` mod fails
  * Correctly supports DAP clients using `path` path format instead of `uri`
* Sumneko plugin:
  * Include `__modname__` tag when ingoring commands at start of line
  * Strip file extension from slashed `require` paths to better match Factorio's resolution
* VSCode:
  * Migrate Mod Portal API key from VSCode key storage to `keytar` for consistent behavior across packages
    * Ignore key storage if key is set in environment
  * Custom Editor for `mod-settings.dat`
  * Re-check if active version is Steam before launching debug
  * Experimental Read-only Editor for `script.dat` (saved `global` data)
    * Plain lua values should all load correctly, but not all LuaObject types have been tested.

## 1.1.28
* Debugger:
  * Fixed some cases where mods could clobber builtins that debugger relies on
  * Fixed breakpoint validation incorrectly moving breakpoints from valid locations

## 1.1.27
* Tasks:
  * Fix PATH variable separator used on non-windows when adding `fmtk` from extension for scripts
  * added `fmtk details` to update mod details and gallery from info.json, readme.md, faq.md
  * CLI tasks store api key in OS keychain if available
* Locale:
  * Various TextMate grammar tweaks
  * New AST-based parser for more accurate LSP features
* Mod Manager:
  * `fmtk mod install` can now download from portal
* Debugger:
  * Moved `modsPath` deduction from environment from extension to common DAP code
  * Fixed conditional breakpoints not skipping correctly
  * Fixed display of fetchable functions on LuaObjects with json v3
  * Breakpoints now start unverified until the file is loaded
  * Disassembly now formats instruction raw bytes with leading zeros
  * Use `console` type Output Events for messages printed from debugger internals
* Profiler:
  * Fixed some instances of profiler UI not being created/disposed correctly
* Sumneko plugin:
  * Ignore `/c`, `/command`, `/sc`, etc at start of a line

## 1.1.26

* Fixed debugadapter mod package bundled incorrectly (for real this time)
* Fixed require of a removed file

## 1.1.25

* Fixed debugadapter mod package bundled incorrectly

## 1.1.24

* Sumneko 3rd party library package:
  * Generated docs are no longer in workspace, instead a 3rd party library package is built in workspace-storage to reduce clutter and better support multi-root workspaces. Note this will not automatically clean up the old files/settings you may have had, to avoid clobbering any customizations.
  * Includes [FactorioSumnekoLuaPlugin](https://github.com/JanSharp/FactorioSumnekoLuaPlugin) automatically
  * Includes some additional static library files for `serpent`, `mod-gui`, `util`, etc
  * Additional tweaks to libraries (`math`, `package`, `debug`, etc...) to reflect factorio's changes to Lua builtin libraries
  * Generated docs now use `@enum` tags for `defines`
  * Removed generated type aliases for bare event names. Use `EventData.eventname` instead (introduced 1.1.16).
  * Callable classes now use `@overload` tags
* Locale:
  * Added syntax highlighting for `__FLUID__name__`, and move/click controls
  * Added snippet for `__FLUID__name__`

## 1.1.23

* Fixed library management incorrectly truncating the end of the array
* Convert Locale and Changelog support to LSP
* Small DAP protocol fixes
* Go To Definition and Completion support for locale keys in Lua
* Fixed an issue where preparing debug views of a table could inadvertantly cause it to rehash ("invalid key to next" when iterating while deleting)
* Tasks all converted to standalone processes:
  * No longer automatically runs `compile` tasks before debug session. Use `preLaunchTask` if you want these tasks still run.
  * Publish subtasks have been reordered for easier recovery from failed uploads
  * Default publish branch now follows the value of `git config init.defaultBranch`
* Disabled `checkGlobals` in simulations by default.
* Fixed an incorrect warning when unregistering/reregistering command handlers.

## 1.1.22

* Add `global` back to `Lua.diagnostics.globals`
* Offer to regenerate docs when they seem to be out of date
* Generate operators for sumneko 3.5
* Option to not generate docs when selecting a version
* Bundle extension with esbuild (overall ~1/4 download size)
* WIP support for running debug adapter and some mod management commands outside vscode for other editors/debug adapter clients

## 1.1.21

* Support v3 json docs
* Some overlay corrections to `BlueprintControlBehavior`
* Automatically manage data and docs links in `Lua.workspace.library`
* General cleanup of docs generator
* Added command to clear saved API key

## 1.1.20

* Fix some ts->js files with inconsistent file case

## 1.1.19

* Added missing config definition for `factorio.workspace.library`
* Support `${env:ENVVAR}` in path settings
* Correctly generate `enum` concept types
* Migrate API keys to secure storage from settings
* Clarify prompts on manaul factorio version configuration
* New default numeric type option: Use `alias` for numeric types which exactly match `number` (or `integer` if enabled), and `class` otherwise

## 1.1.18

* Restored incorrectly removed definiton for `modsPath` in launch.json
* Use `integer` as the base type for factorio's int builtins

## 1.1.17

* Doc Generation Options:
  * Alias or class for specialized number types
  * Version for online doc links
* Correctly handle no `.vscode/factorio` dir in cleanup before generation
* `LuaObject` as base class for all classes, instead of union of all classes
* `__debugchildren` has been replaced by `__debugcontents`
* Debug console evals that return multiple results will show all results

## 1.1.16

* Generate an indexed type for `defines.prototypes`
* Factorio Version Selector
* Generate Sumneko EmmyLua typdefs in multiple files, and automatically when switching versions
* Correctly locate files in `core` and `base` when debugging
* `__DebugAdapter.dumpIgnore(source:string|string[])` to disable dumping (disassembly, breakpoint validation) for specific files. This is useful for very large data files where stepping is not relevant and dumping is expensive (long hang when `require`ing the file).
* Moved event data types to `EventData.eventname` type names, with (temporary) aliases from `eventname` for compatiblity
* Improved generation of union and table_or_array concepts and defines types
* Correctly locate files in user scenarios
* Removed `__DebugAdapter.levelPath` stub

## 1.1.15

* Terminate sessions instead of hanging when failing to read JSON docs
* Read correct JSON docs path on mac

## 1.1.14

* Load LuaObject type data from Factorio's JSON docs for listing properties when debugging
* List some property-like function on LuaObjects as fetchable properties
* `__DebugAdapter.stepIgnore()` now handles both tables and functions. `__DebugAdapter.stepIgnoreAll()` has been removed.
* Updated Sumneko EmmyLua typdef generator for Sumneko 3

## 1.1.13

* Added `__REMARK_COLOR_BEGIN__` and `__REMARK_COLOR_END__` to locale highlighter
* Publishing mods now uses the new Mod Portal Upload API.

## 1.1.12

* __DebugAdapter.terminate() to end session from script
* __DebugAdapter.raise_event(event,data,modname) to call event handlers directly for testing
* Updated LuaObject recongition for debug views to reflect implementation detail changes in Factorio's API (no longer uses `__self`)
* Don't accept `nil` filters on custom-input events
* TypeDef generator now accepts Factorio Machine-Readable-Docs V2
* Various disassembler view fixes

## 1.1.11

* Don't offer ! and version in depencency snippets
* Add overlay for tweaks to generated typedefs
* Various disassembler fixes
* Support "Loaded Sources" view
* Significant (~2x) speedup in profiling, noise reduction on line timers
* Profiler can now measure `on_load`

## 1.1.10

* Correctly capture raw `remote` for debugger internal use before replacing it with wrapper
* New Command "Generate Typedefs" to convert json docs to EmmyLua docs (and configure general workspace settings)

## 1.1.9

* Correctly reverse-lookup `defines.inventory.artillery_wagon_ammo`
* Warn when using `math.randomseed()` which is disabled in Factorio
* Warn when replacing an existing event handler
* Correctly handle empty `info.json` files in workspace

## 1.1.8

* Mod name and title lengths are now limited to 100 characters
* Correctly validate `~` unordered mod dependencies
* Snippet for creating dependency entries

## 1.1.7

* Fixed `failed locating source` for unpacked mods located through modsPath

## 1.1.6

* Fixed steam detection on mac/linux
* Additional diagnostics for failures while locating source for mods

## 1.1.5

* Added `no_git_tag` option in `info.json`
* Re-enabled expandable log items from `__DebugAdapter.print()`
* Expand embedded expressions in printed strings as variables
* Use "loose" semver parsing in various places, to handle extra leading zeros
* Converted "Output" window messages to debug console output
* Activate Zip Explorer extension before trying to run commands from it
* Added setting `factorio.package.defaultPublishBranch`

## 1.1.4

* Update class data to Factorio 1.1.12
* Fixed "attempt to index local 'lastframe' (a nil value)" when calling `__DebugAdapter.breakpoint`
* Use Command text as source when available
* Disassemble Lua if no source is available
* Correctly resolve `@__core__` paths
* Fixed `script.on_event` would silently ignore filters when registering lists of events

## 1.1.3

* Step-in on api access that raises events will step into handlers
* Fixed "attempt to index local 'lastframe' (a nil value)" when breaking on exception
* Removed break-on-exception when not running in Instrument Mode
* If selected frame has a local or upval `_ENV`, evals will use it instead of the global environment
* Removed Event Check
* Expand functions's upvals as children in Variables view
* `__DebugAdapter.levelPath` is no longer required, as it can be filled automatically from `script.level`

## 1.1.2

* Show best-guess arguments for `__index` and `__newindex` in stack trace
* Collect and display stacks for some api calls that can raise events
* Display enum properties of LuaObjects as names from `defines.*`
* Metatable field `__debugtype` to set the displayed typename of an object
* Show table keys with virtual children `<key>` and `<value>` and rename with unique names
* Upload task now looks for zips in the correct place when Package is configured to place them outside the mod folder
* Launch option `adjustModSettings` to update/clear mod settings before launching a debug session
* Don't hang when `info.json` with `null` exists in workspace
* Don't set extension filter on factorioPath prompt on non-windows
* Update class data to Factorio 1.1.6

## 1.1.1

* Fix setting breakpoints during simulations

## 1.1.0

* Always use `-F -` for tags, even when empty
* Fix infinite recursion when cleaning long refs
* Disabled expandable log items from `__DebugAdapter.print({...})` by default due to issues with vscode debug console
* Updated class data and mod for Factorio 1.1.0

## 0.18.49

* Correctly highlight empty plural
* Fixed crash if an on_tick handler with no argument has a LuaObject in its first temporary when building callstack
* Ignore info.json in scenarios/saves

## 0.18.48

* Fix error when mods replace builtin `print` incorrectly

## 0.18.47

* Pretty-print mod-list.json when adjusting mods
* Stricter check for LuaObjects in isUnsafeLong()

## 0.18.46

* Removed Locale highlighter rule for unrecognized rich text tags
* Fixed script error when setting checkEvents or checkGlobals

## 0.18.45

* Capture `debug` in case someone overwites it

## 0.18.44

* Reworked locale highlighter
* Locale Snippets for various tags/variables
* Correctly highlight locale variable `__CONTROL_MOVE__`
* CodeAction to merge duplicate locale sections

## 0.18.43

* Correctly include `profile-control.lua` when debugadapter itself is not hooked

## 0.18.42

* Fix flamegraph not building trees correctly
* Configuration options for various extra diagnostics
* `postpublish` task
* Open Changelog command in packages view
* Eval now correctly uses the last matching local instead of the first
* Rename shadowed locals in Variables view so they display correctly
* Fixed not correctly differentiating multiple varRefs for the same table with `extra` property set
* Mark generated variables as `virtual`

## 0.18.41

* Debug console supports `__modname__` prefix while in break
* Better error reporting for tasks.json tasks
* Branch name configuration for Publish was not correctly applied
* Timeout on queued stdin commands configurable, raised default to 2s
* Restrict tasks to operate only on the latest version of a mod
* Support `~` in launch.json path options

## 0.18.40

* Fixed incorrect vars showing when first retreived after stopping on first stop in a lua state

## 0.18.39

* Fixed incorrect vars showing when first retreived after stopping

## 0.18.38

* Fixed debug session not ending when factorio closes
* More consistent use of URIs for path mapping
* Debug console supports `__modname__` prefix when named Lua State is available (correctly this time...)

## 0.18.37

* Return original unwrapped handler from `script.get_event_handler`
* Fixed various missing stepIgnores
* stepIgnore and stepIgnoreAll now return the function/table passed in, for convenience
* Most objects printed with `__DebugAdapter.print(obj)` will be expandable in debug console as long as the source Lua State is still active
* Pause button able to break into long running code
* General code cleanup
* Optional arguments `upStack` and `category` on `__DebugAdapter.print()`
* Debug console can be used while running - it will run in the active Lua State for settings/data or in `level` if available for control.
* Correctly display and offer more color formats in locale
* Task "adjustMods" can be used to reconfigure mods from vscode
* Fix infinite loop in eval _ENV lookups when function outlives the eval that created it
* Support vscode vars in launch.json config
* Debug console supports `__modname__` prefix when named Lua State is available
* Branch name for Publish is configurable

## 0.18.36

* Profiler flamegraph label more reliable
* Don't show flamegraph panel when tracking call trees not enabled

## 0.18.35

* Profiler flamegraph works correctly on VSCode 1.48

## 0.18.34

* Add locale vars `__CONTROL_STYLE_BEGIN__` and `__CONTROL_STYLE_END__` (for real this time)
* Locale var `__ALT_CONTROL__` correctly matches two args
* Fix breakpoints not loading initially in settings stage
* Added profiler flamegraph of call trees
* Profiler options to select line/function/calltree timers
* `__DebugAdapter.defineGlobal(name)` to disable warning on global access
* Profiler remote interface

## 0.18.33

* Add locale vars `__CONTROL_STYLE_BEGIN__` and `__CONTROL_STYLE_END__`
* Add options to configure created mod zip location, and automatically remove after successful publish
* Detect and offer to disable prototype caching, which conflicts with part of debugger init
* Added `compile` task which is run in `package` and before launching debug session
* Added variable $MODNAME to git templates
* Added setting "factorio.package.tagName"
* Deprecated setting "factorio.package.tagVPrefix"

## 0.18.32

* Updated class data to Factorio 1.0.0
* Temporarily unlisted property LuaItemStack::blueprint_icons to avoid crash when reading it in Factorio 1.0.0

## 0.18.31

* Allow 1.x in various compatibility version tests

## 0.18.30

* Remove special case for `__self` in eval env
* Support(ish) launching Factorio with a native debugger

## 0.18.29

* Use `rawget` when identifying tables for inspection
* Remove duplicate `@` in function descriptions
* Steam support

## 0.18.28

* Include factorioPath="" in initialConfigurations
* Better error when calling remote interfaces or methods that don't exist
* Merged Factorio Mod Packages views into one. Depending on configuration, you may need to reactivate the view after this update.
* Factorio Mod Packages view has an icon when used as a standalone panel
* Sorted Factorio Mod Packages view alphabetically
* Correctly catch `error(nil)`
* Correctly wrap `script.on_nth_tick` when given an array of ticks

## 0.18.27

* More correct heuristic for attempting to translate tables as LocalisedString, gracefully handle translation failure.

## 0.18.26

* Updated Mod Portal login procedure to work with the new Portal

## 0.18.25

* Report errors and more detail when searching for mods for path mapping

## 0.18.24

* Nicer log() hook on Factorio >= 0.18.34
* Ignore Unicode BOM in Changelog files
* Cleaned up path mapping between factorio/vscode
  * Now supports non-versioned unzipped mods
  * Correctly loads unzipped mods from mods from modsPath~=workspace before zipped mods
  * Correctly parse mod paths with __ in paths
  * Load only used zips when launching debug
  * Clear previously loaded zips before reloading
  * If using manual require in settings stage, it may now be needed to list debugadapter as an optional dependency to ensure Modules event is completed first. Instrument mode handles this automatically.
* Updated class data to Factorio 0.18.34
* Wrap new script.raise_* methods to pass call stack, matching raise_event wrapper
* Don't omit source on stepIgnore stack frames

## 0.18.23

* Correctly encode Infinity, -Infinity and NaN in json
* Set stepIgnore on log hook functions
* Support new metamethod `__debugvisualize(self)` for formatting values for [hediet.debug-visualizer](https://marketplace.visualstudio.com/items?itemName=hediet.debug-visualizer)
* Debug line and visualizer for noise expressions
* Warn on first assignment to undefined Lua global variables

## 0.18.22

* Changed automatic zip exclusion when packaging from `**/*.zip` to `**/modname_*.zip`, to prevent excluding `blueprint.zip` in scenarios.

## 0.18.21

* Fixed incorrect regex in info.json schema

## 0.18.20

* Use Lua Registry to enforce certain libraries are singletons even when package.loaded is cleared in data stage
* Correctly report parse errors in timed eval requests
* Don't flag spaces in mod names in dependencies as errors (old mods with spaces exist)
* Profile line timers now include called function time, added function timers
* Incremental dumping of profile timers to reduce stutter while profiling
* Reworked profile line timer coloring options

## 0.18.19

* Capture `print` and `localised_print` in `profile.lua` for compatiblity with mods that overwrite them
* Better calculation of profile column width
* Fix an error in prior update's change to display of array-like tables

## 0.18.18

* Removed StreamSplitter
* On Factorio>=0.18.24, use `localised_print` to translate various output:
	* Error messages, including multi-line output
	* LocalisedStrings and LuaProfilers in Variables view
	* LocalisedStrings in `log` hook and `__DebugAdapter.print`
	* LocalisedStrings in Debug Console output or errors
	* Duration of Debug Console commands, timers for profiling
* Alternate hook mode for live-ish profiling in control stage
* Correctly identify tailcalls in `log` hook and `__DebugAdapter.print`, instead of incorrect callsite
* Use a more permissive JSON schema for `info.json` inside `data`
* Correctly exclude locale `info.json` files from mod/data schema
* Support [hediet.debug-visualizer](https://marketplace.visualstudio.com/items?itemName=hediet.debug-visualizer), with eval context "visualize" and user-provided visualization converters
* Print type of invalid objects in json
* Correctly show children of tables with large gaps in array segment
* Live terminal output for mod scripts in packaging tasks
* Updated class data to Factorio 0.18.24


## 0.18.17

* Fix `Version` task failing when symbols in `info.json` cannot be loaded
* Correct order of comment syntax rules for Locale files
* Show warnings for various problems in Locale files
* Fixed F5 while running would queue up incorrect commands
* Display `[Variables Currently Unavailable]` when variables cannot be displayed for the current stack frame
* Don't pre-load mod zips when launching without debugger

## 0.18.16

* Add allowDisableBaseMod to disable protection on `base` in `adjustMods`
* Hook `log()` to produce Output events with clickable source links. Launch args `hookLog` and `keepOldLog` can adjust this behavior.
* Error hint for missing config.ini
* Launch Args to selectively install hooks in Settings, Data and per-mod in Control stage. Settings and Data now default off and must be enabled if desired, Control defaults to hook all mods.
* Launch Arg factorioPath is no longer required - if absent or empty, will prompt for location
* More correct handling of tables with unusual numeric keys
* Follow `terminal.integrated.shell.*` and `terminal.integrated.automationShell.*` settings

## 0.18.15

* SIGKILL for second attempt to kill Factorio when ending a debug session
* Fix rawlen() fix incorrectly applied to LuaCustomTable
* Add adjustMods and disableExtraMods to launch args
* Step inside zip files with slevesque.vscode-zipexplorer

## 0.18.14

* Include JSON Scheme for clusterio instances.json file
* Use rawlen() in Variables views to correctly handle objects with incorrect __len metamethods

## 0.18.13

* Catch rare condition in Increment Version command where no symbols are found in info.json
* Correctly report missing paths in config.ini
* Don't attempt to translate errors outside of events
* Updated class data to Factorio 0.18.18
* Correctly update level script path after path hint

## 0.18.12

* Accept top level null in scenario/campaign info.json
* Highlight comment and invalid lines in locale
* Provide default GitLens config for changelogs
* Use annotated git tags. Optionally prefix version with 'v' and include commit message.
* Always include trailing slash on `--mod-directory`
* Updated class data to Factorio 0.18.17

## 0.18.11

* Updated class data to Factorio 0.18.13
* Auto-generated git commits now set configurable author, and message templates configurable
* Use `terminal.integrated.env.{platform}` settings to provide additional env vars to mod scripts

## 0.18.10

* Updated Debug Adapter Protocol capabilities report
* Updated class data to Factorio 0.18.12

## 0.18.9

* Fix config.ini failing to auto-detect in many scenarios
* Improved logging of what files are auto-detected where

## 0.18.8

* Fix typo in Increment Version command label
* Fix not always killing Factorio on Macs
* Read config.ini for mods/data paths. Removed dataPath in launch config, added configPath. modsPath and configPath also set the corresponding command line args.
* Don't recheck info.json during a debug session, only when starting a new session.
* Fixed crash when running remote.call() in /c
* Don't attempt to catch an exception if there is no locatable source to show it at (eg. console commands)

## 0.18.7

* Correctly handle `script.on_nth_tick(nil)`

## 0.18.6

* Don't add `--instrument-mod` to command line args when launching without debug

## 0.18.5

* Updated class data to Factorio 0.18.10
* Use Instrument Mode by default (Requires Factorio >= 0.18.10)
* Force canonical-name requires for public-facing files (debugadapter.lua and variables.lua)

## 0.18.4

* Added __DebugAdapter.breakpoint(mesg)
* `\n` escape in locale is now `constant.character.escape.factorio-locale`
* Hook `pcall` and `xpcall` and allow optionally breaking on caught exception
* Use environment vars FACTORIO_PORTAL_USERNAME and FACTORIO_PORTAL_PASSWORD when not configured in settings
* provide environment var FACTORIO_MODNAME and FACTORIO_MODVERSION to all mod scripts
* explicitly save files edited by tasks, instead of saveAll
* packages view may be moved to SCM section
* fixed Package command not waiting to finish building zip before returning, which caused it to sometimes pick up edits made later by Publish

## 0.18.3

* non-standard category in changelog as Hint instead of Information
* Factorio 0.18.2 added LuaEntityPrototype::inserter_pickup_position and inserter_drop_position
* evil translation hack to display translated LocalisedString errors
* changelog linter error for line prefix with no content
* remove changelog diagnostics when a file is removed
* allow two-part version in info.json dependencies
* automatically package and publish mods

## 0.18.2

* Changelog separator line is keyword.control
* correctly highlight changelog version number with only two numeric parts
* changelog linter
* color widget on [color=...] tags in locale
* add support for proposed "Instrument Mode", disabled by default
* fix incorrect link in campaign schema to scenario schema
* outline for locale and changelog
* improved highlighting of plurals in locale files
* correctly highlight inside enclosing tags in locale

## 0.18.1

* __DebugAdapter.print(notstring) will print the object's `describe` lineitem
* don't trim log messages
* fix debugging data stage after entrypoint changes, for real this time
* JSON Schemas for info.json, description.json, server-settings.json, map-settings.json, map-gen-settings.json
* Syntax highlighting for Locale *.cfg and changelog.txt files
* Factorio 0.18.1 added LuaSurface::brightness_visual_weights
* Keep output channel open and reuse between sessions

## 0.18.0

* Update for Factorio 0.18
* use `script.active_mods` to remove last dependencies on `game`. Enables stepping in control.lua main chunk and on_load, and break-on-exception in on_load. Removed various workarounds for not having this.
* use LuaObject.object_name to classify objects. Detailed views of LuaStructs.

## 0.17.8

* better hide frames with no available source
* fix debugging data stage after entrypoint changes
* allow extra args to factorio
* evaluate names for most variables

## 0.17.7

* stepIgnoreAll(t) function to ignore all functions in table
* __DebugAdapter.print() supports `{...}` to fill varargs in string.
* escape 13 in breakpoints
* omit frame source for C functions in call stack
* break-on-exception in most events and improved entrypoint identification
* warn if mod registers probably-incomplete sets of events
* jump to location in stacktrace works

## 0.17.6

* correctly bracket strings ending in partial close brackets
* paged display of large array-like objects
* escape 26 in breakpoints
* disable profiler and coverage when enabling debugadapter
* disable debugadapter mod on "Run Without Debugging"
* better display of custom commands and custom-input event handlers
* reorder scopes in Variables window to be generally innermost to outermost
* optimized remote.call hook

## 0.17.5

* mark various internals as stepIgnore
* binary format for breakpoints, divided up one file per command, to fit better in 250 char limit of debug.debug()
* more consistently update breakpoints before resuming execution

## 0.17.4

* include for loop internals in `<temporaries>` section
* bring my own json to remove many dependencies on `game` object
* optimizations
* name `(main chunk)` in stack traces
* set breakpoints earlier (still can't attach before `game` is available though)
* varargs sorted into special child of Local scope, after fixed args
* automatically install and enable/disable mod
* works if `require`d into data or settings stage
* accumulate stderr until newline, then strip debug prompts and return non-empty strings
* better handling of paths
* "Factorio Mod Debug" output channel listing various info about what paths it found
* detect `mod-list.json` inside workspace and use its location as modsPath

## 0.17.3

* don't remove leading '/' from workspace paths on non-windows
* better path guess on mac
* don't try to instrument remote.call during on_load

## 0.17.2

* more improved escaping
* search for mods inside vscode workspace first, then modsPath
* top level scope for factorio `global`
* filter temporaries to special child of Local scope
* filter "built in" globals to special child of Global scope
* fix display of eval _ENV
* unquote string keys when possible in table describe

## 0.17.1

* docs improvements
* tail calls in stack trace
* provide escapes `{[}` -> `{` and `{]}` -> `}` in interpolated strings
* support condition and hitCondition in breakpoints
* improved escaping of various strings
* don't allow setting `self` (the current object) inside string interpolation for debug lineitems
* describe main chunk functions
* mask dostring full-source chunk names as "=(dostring)"
* omit numeric keys when possible in table describe
* add `__DebugAdapter.dumpBreakpoints` to manually list breapoints

## 0.17.0

* Initial Release
