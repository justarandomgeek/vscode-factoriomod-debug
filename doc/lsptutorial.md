# Setting up sumneko-3rd  in other editors

If you want better LSP support outside of vscode, you can't just use the extension. You will need to generate the lua ls plugin and set the path to it in your editor. 

# Generating files

Get [fmtk from npm](https://www.npmjs.com/package/factoriomod-debug), which is the commandline tool.

Download the docs([direct link](https://lua-api.factorio.com/latest/static/archive.zip)) or go to the [API docs] (https://lua-api.factorio.com/latest/) and download from the link in the bottom (same thing as the direct link).

Extract the docs anywhere and open that folder in a terminal and  run the following command to generate the files:

```fmtk sumneko-3rd -d runtime-api.json -p prototype-api.json```

This will make a folder called factorio in the directory you opened the terminal in. You can copy paste this anywhere at all, I put it in C:/libraries.
  
# Inluding it in your LSP (Neovim)

Make sure you already have your LSP server working - add the following to your lspconfig:

```lua
lspconfig.lua_ls.setup {
  settings = {
    Lua = {
      workspace = {
        library = {
          [vim.fn.expand "C:/libraries"] = true,
        },
      },
    },
  },
}
```
