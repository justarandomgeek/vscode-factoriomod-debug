# VS Code Factorio Mod Debug

This is a debug adapter for developing Factorio mods. It supports breakpoints, stepping, variable access, and the debug console. Furthermore, this extension offers profiling, packaging and publishing supports for Factorio mods. It also enhances/implements language server features for various Factorio mod file formats, including Factorio API Typedefs for [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua).

## Using Factorio Mod Debug

* Install the **Factorio Mod Debug** extension in VS Code.
* Switch to the run/debug view (View->Run) and select "create a launch.json file"
* Select the debug environment "Factorio Mod Debug".
* Adjust the paths and launch settings as required. Check Intellisense for additional launch options.
* Press the green 'play' button or F5 to start debugging.

## Debugging inside Zip Files

If [Zip File Explorer](https://marketplace.visualstudio.com/items?itemName=slevesque.vscode-zipexplorer) is also installed, breakpoints and stepping will work inside zipped mods.

## Steam

If you use a Steam install, a file `steam_appid.txt` with content `427520` in the same dir as the factorio binary is required. If VSCode has write access to the dir, it will create this automatically.

## More Features

  * [Debugger Mod API](doc/debugapi.md)
  * [Custom Debug Views](doc/variables.md)
  * [Language Features](doc/language.md)
  * [Mod Packaging](doc/package.md)
  * [Profiling](doc/profile.md)
  * [Workspace Setup Tips](doc/workspace.md)

## Support the Debugger

[<img height='36' style='border:0px;height:36px;' src='https://az743702.vo.msecnd.net/cdn/kofi2.png?v=2' border='0' alt='Buy Me a Coffee at ko-fi.com'/>](https://ko-fi.com/X8X41IE4T)
