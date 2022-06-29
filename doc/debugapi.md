## String Interpolation

Several locations in the interface use string interpolation with expressions in `{}`. The inner expression is evaluated as lua code. `{[}` and `{]}` can be used to emit literal `{` and `}`.

When used with Logpoint expressions, exception strings, and `__DebugAdapter.print()`, the inner expression has access to all locals and upvalues at the current location, and the expression `{...}` will represent the varargs available at that location, if available.

The expression always has access to globals.

## Debug Print

The function `__DebugAdapter.print(expr,alsoLookIn)` can be used to print messages using string interpolation to the vscode debug console. An indexable object `alsoLookIn` may provide additional values for the expressions in the string, which will be used before other variables.

## Manual Breakpoints

If normal breakpoints are unusable for some reason, you can call `__DebugAdapter.breakpoint(mesg:LocalisedString)` to break. If `mesg` is specified, it is displayed in the editor like an exception.

## Terminate Session

`__DebugAdapter.terminate()` can be used to terminate a debug session from mod code.

## Simulate Events

`__DebugAdapter.raise_event(event:defines.events|number|string,data:EventData,modname:string)` can be used to call event handlers directly for testing. `data` is not validated, so you must ensure it is a well-formed event payload for `event` yourself. All event and custom-input handlers are raisable, even those not raisable through `script`.

## Ignore Functions in Stepping

Functions can be excluded from stepping with `__DebugAdapter.stepIgnore(funcOrTable)`.

## Disable dumping for large files

files can be excluded from dumping with `__DebugAdapter.dumpIgnore(nameOrNames)`. These must be exact source names, e.g. `"@__modname__/file.lua"`. This will disable disassembly, breakpoint validation, phobos debug symbols, and possibly other future features in these files. This may be appropriate if you are experiencing long hangs on `require`s of large (5+MB) data files.