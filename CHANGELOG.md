# Changelog

## 0.17.6

* correctly bracket strings ending in partial close brackets
* paged display of large array-like objects
* escape 26 in breakpoints
* disable profiler and coverage when enabling debugadapter
* disable debugadapter mod on "Run Without Debugging"
* better display of custom commands and custom-input event handlers

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
