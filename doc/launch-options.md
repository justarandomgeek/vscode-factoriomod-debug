# FMTK `launch.json` options

FMTK uses Factorio's native Lua debug adapter. A launch configuration belongs in
`.vscode/launch.json` and must use the `factorio` debug type and the `launch`
request.

Before starting a debug session, select a local Factorio installation with the
FMTK Factorio version selector. An online-documentation-only version cannot be
used for debugging.

## Minimal configuration

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "factorio",
      "request": "launch",
      "name": "Debug Factorio"
    }
  ]
}
```

`version` and `configurations` belong to VS Code's `launch.json` format. The
properties documented below belong to an individual item in `configurations`.

## Complete example

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "factorio",
      "request": "launch",
      "name": "Debug Factorio",

      "factorioArgs": [
        "--mod-directory",
        "${workspaceFolder}",
        "--disable-migration-window"
      ],
      "tags": {
        "development": true,
        "variant": "local"
      },
      "followSymlinks": true,
      "hookDebugConsole": false,
      "trace": false,
      "env": {
        "FMTK_EXAMPLE": "value"
      }
    }
  ]
}
```

VS Code variables such as `${workspaceFolder}` are substituted before FMTK
processes the configuration.

## Configuration properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | required | The name displayed in VS Code's Run and Debug configuration list. |
| `type` | string | required | Must be `"factorio"`. |
| `request` | string | required | Must be `"launch"`. FMTK does not define an `attach` configuration. |
| `factorioArgs` | string[] | `[]` | Additional command-line arguments for Factorio. Each argument must be a separate array item. See [`factorioArgs`](#factorioargs). |
| `tags` | object | none | Small, arbitrary values made available to mod code for this debug session through `debugadapter.tags`. |
| `followSymlinks` | boolean | `true` | Follow symbolic links when the debug adapter emits source locations. Disable this when source paths should retain the symlinked form. |
| `hookDebugConsole` | boolean | `false` | Allow errors, breakpoints, and stepping in Lua invoked by an evaluation from VS Code's Debug Console (`repl` evaluation context). Requires Factorio 2.1.10 or later. |
| `trace` | boolean | `false` | Write Debug Adapter Protocol traffic to `dap-trace.log`. This can contain source paths, expressions, and values, so inspect it before sharing it. |
| `env` | object of strings | none | Environment variables for the Factorio process. This property is supported by FMTK's launch code even though it is not declared in the debugger contribution schema. See [Environment variables](#environment-variables). |

### `factorioArgs`

`factorioArgs` is passed to Factorio by its native debug adapter. It is the way
to select a save or scenario, set the mod directory, or use other Factorio
command-line switches. FMTK does not validate the switches; whether a switch is
available depends on the selected Factorio version.

Keep option names and values in separate array entries:

```jsonc
"factorioArgs": [
  "--mod-directory",
  "${workspaceFolder}",
  "--load-scenario",
  "MyScenario"
]
```

Do not use the generic `args` property for these arguments. FMTK and the native
adapter use `factorioArgs`.

#### Automatic mod-directory detection

When `factorioArgs` does not contain an item exactly equal to
`"--mod-directory"`, FMTK searches the workspace for `**/mod-list.json`:

- If it finds no files, Factorio's default mod directory is used.
- If it finds one file and its directory differs from the selected Factorio
  installation's default mod directory, FMTK appends `--mod-directory` and that
  directory to `factorioArgs`.
- If it finds more than one file, launch fails because FMTK cannot choose a mod
  directory.
- If `--mod-directory` is already present, no search or automatic selection is
  performed.

Use `"--mod-directory", "path"` as two entries. A combined entry such as
`"--mod-directory=path"` is not recognized by FMTK's detection check and may
cause it to append a second mod-directory option.

### `tags`

Tags pass launch-specific data into Lua without using environment variables or
Factorio settings:

```jsonc
"tags": {
  "runIntegrationTests": true,
  "testGroup": "control-stage"
}
```

During the session, mod code can read these values from
`debugadapter.tags`. Keep the object small; it is debug-session metadata, not a
general data-transfer mechanism.

### `followSymlinks`

With the default value of `true`, source locations resolve through symbolic
links. Set it to `false` when the symlink path is the path represented in the
workspace and resolving it would prevent VS Code from matching breakpoints to
the open source file.

### `hookDebugConsole`

Normally, Lua executed because of an expression entered in the Debug Console is
not itself hooked for errors, breakpoints, or stepping. Setting
`hookDebugConsole` to `true` enables those debugger hooks for Debug Console
evaluation. It applies only to evaluation requests whose context is `repl`.
This option requires Factorio 2.1.10 or later.

### `trace`

Set `trace` to `true` when diagnosing communication between VS Code and
Factorio's debug adapter. The adapter writes the exchanged DAP messages to
`dap-trace.log`. The extension's code does not choose or document a separate
output path for this file.

### Environment variables

Launch-specific variables can be supplied with `env`:

```jsonc
"env": {
  "MY_MOD_TEST_MODE": "1"
}
```

FMTK also has a workspace/user setting named `factorio.debug.env`. At launch,
the effective environment is assembled in this order:

1. `factorio.debug.env` provides the base values.
2. The launch configuration's `env` overrides values with the same names.
3. FMTK sets `SteamAppId` to `427520`, overriding either source.

The selected Factorio executable is launched with that environment. Its working
directory is the first workspace folder; there is no FMTK launch option for
changing it.

## Related settings that do not belong in `launch.json`

These settings affect launch behavior but must be placed in VS Code settings
(for example, `.vscode/settings.json`), not in a launch configuration:

| Setting | Description |
| --- | --- |
| `factorio.versions` | Factorio installations known to FMTK. Normally managed through the Factorio version selector. The active entry supplies the executable and Factorio data paths. |
| `factorio.debug.env` | Base environment variables merged with the launch configuration's `env`. |
| `factorio.debug.shim` | Executable to start instead of Factorio directly. FMTK invokes the shim with the selected Factorio executable path and `--dap`; this is intended for tools such as a native debugger shim. |

For example:

```jsonc
{
  "factorio.debug.env": {
    "COMMON_VARIABLE": "shared by all Factorio launches"
  },
  "factorio.debug.shim": "vsjitdebugger.exe"
}
```

## VS Code's standard debug properties

VS Code handles its standard configuration properties, such as
`preLaunchTask`, `postDebugTask`, `presentation`, and
`internalConsoleOptions`, around the debug adapter. They are not FMTK options
and are not read by this extension. In particular, `program`, `args`,
`runtimeExecutable`, and `cwd` do not replace the Factorio executable,
`factorioArgs`, or working-directory behavior selected by FMTK.

## Obsolete `factoriomod` configurations

The old `"type": "factoriomod"` launch type is deprecated and its mod-based
debug adapter has been removed. Historical options for that adapter—including
`modsPath`, `manageMod`, `adjustMods`, `adjustModSettings`, `disableExtraMods`,
`allowDisableBaseMod`, `useInstrumentMode`, `checkPrototypes`, `hookSettings`,
`hookData`, `hookControl`, `hookMode`, `hookLog`, `keepOldLog`, `runningBreak`,
`runningTimeout`, and the `profile*` options—are not supported by the current
`factorio` launch type.

Use Factorio command-line switches in `factorioArgs` and the native adapter
options documented above instead.
