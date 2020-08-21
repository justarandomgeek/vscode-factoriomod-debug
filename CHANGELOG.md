# Changelog

## 0.18.33

* Add locale vars `__CONTROL_STYLE_BEGIN__` and `__CONTROL_STYLE_END__`
* Add options to configure created mod zip location, and automatically remove after successful publish
* Detect and offer to disable prototype caching, which conflicts with part of debugger init
* Added `compile` task which is run in `package` and before launching debug session

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
