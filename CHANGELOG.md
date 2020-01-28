# Changelog

## 0.18.3

* non-standard category in changelog as Hint instead of Information

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
