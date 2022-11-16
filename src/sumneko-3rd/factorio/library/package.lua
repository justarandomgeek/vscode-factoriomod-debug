---@meta

---Due to the changes to `package`, the functionality of `require()` changes. When using absolute paths, the path starts at the mod root. Additionally, `..` is disabled as a path variable. This means that it is not possible to load arbitrary files from outside the mod directory.
---
---Factorio does however provide two ways to load files from other mods:
---
--- * The "lualib" directory of the core mod is included in the paths to be checked for files, so it is possible to require files directly from there, such as the "util" file by using `require("util")`.
--- * Furthermore, it is possible to require files from other mods by using `require("__mod-name__.file")`.
---
---`require()` can not be used in the console, in event listeners or during a `remote.call()`. The function expects any file to end with the `.lua` extension.
---@param modname string
---@return unknown
function require(modname) end

---@class factorio.packagelib
---@field loaded    table
package = {}

return package