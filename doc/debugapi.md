## String Interpolation

Logpoint expressions, `__DebugAdapter.print()`,  and `__debugline` strings will evaluate expressions in `{}`. The inner expression is evaluated as lua code, and has access to all locals and upvalues at the current location (for logpoints), or members of the current object and the object itself as `self` (for `__debugline`). The expression always has access to globals. `{[}` and `{]}` can be used to emit literal `{` and `}`.

## Debug Print

The function `__DebugAdapter.print(expr,alsoLookIn)` can be used to print messages to the vscode debug console. `expr` is string interpolation expression with access to locals at the scope that calls `print()`, and fields in table-like object `alsoLookIn`. The expression `{...}` will expand to the list of the caller's varargs, if any.

## Manual Breakpoints

If normal breakpoints are unusable for some reason, you can call `__DebugAdapter.breakpoint(mesg:LocalisedString)` to break. If `mesg` is specified, it is displayed in the editor like an exception.

## Terminate Session

`__DebugAdapter.terminate()` can be used to terminate a debug session from mod code.

## Simulate Events

`__DebugAdapter.raise_event(event:defines.events|number|string,data:EventData,modname:string)` can be used to call event handlers directly for testing. `data` is not validated, so you must ensure it is a well-formed event payload for `event` yourself. All event and custom-input handlers are raisable, even those not raisable through `script`.

## Ignore Functions in Stepping

Functions can be excluded from stepping with `__DebugAdapter.stepIgnore(funcOrTable)`.

## Disable dumping for large files

Functions can be excluded from dumping with `__DebugAdapter.dumpIgnore(funcOrTable)`. This will disable disassembly, breakpoint validation, phobos debug symbols, and possibly other future features in these files. This may be appropriate if you are experiencing long hangs on `require`s of large (5+MB) data files.