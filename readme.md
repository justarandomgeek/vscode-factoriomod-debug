# Factorio Modding Tool Kit

A collection of tools for developing Factorio mods. This package is both [an npm package](https://www.npmjs.com/package/factoriomod-debug) providing the command line tool `fmtk`, and a [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) providing additional editor integration.

 * [Debug Adapter](doc/debugadapter.md)
 * [Mod Profiling](doc/profile.md)
 * [JSON Validation](doc/language-json.md)
 * [Language Support for Locale and Changelog files](doc/language.md)
 * [Language Server integration for Lua](doc/language-lua.md) via [sumneko.lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua)
 * [Packaging and Publishing](doc/package.md)

 * [Getting LSP on text editors other than vscode](doc/lsptutorial.md)

## Installation and Setup

This guide assumes you already have Factorio installed.

### Visual Studio Code

Install the [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) through the link, or by searching in the Visual Studio Code extensions tab on the left side of the VS Code window.

After installing the extension, there should be a button on the bottom bar of VS Code that reads "Factorio (unselected)". Click on this button, and near the top of VS Code, click "Select other version".

Navigate in the file menu to the Factorio application directory. The exact location Factorio is installed on varies depending on whether you are using Steam and on what operating system you're using, but the [Factorio wiki](https://wiki.factorio.com/Application_directory#Application_directory) has a good section on it. Navigate into the "bin" folder, and into the "x64" folder inside of that, and select the "factorio" or "factorio.exe" file within this folder.

Once you've selected the folder, name the installation. This should be a short memorable name that describes which Factorio version you're using for testing.

At the bottom-right of the VS Code window, there may be a pop-up prompting you to reload VS Code. Click the button to reload VS Code.

That's it! You're all set up and ready to start modding.

## Support FMTK

[<img height='36' style='border:0px;height:36px;' src='https://az743702.vo.msecnd.net/cdn/kofi2.png?v=2' border='0' alt='Buy Me a Coffee at ko-fi.com'/>](https://ko-fi.com/X8X41IE4T)
