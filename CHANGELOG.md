# Changelog

## 0.18.18

* Fix `Version` task failing when symbols in `info.json` cannot be loaded
* Correct order of comment syntax rules for locale files

## 0.18.17

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
* use `script.active_mods` to remove last dependancies on `game`. Enables stepping in control.lua main chunk and on_load, and break-on-exception in on_load. Removed various workarounds for not having this.
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
* bring my own json to remove many dependancies on `game` object
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
