# Generating files

Get the [CLI tool](https://www.npmjs.com/package/factoriomod-debug).

Find the docs in your game install (recommended) or download them. On Windows the default directory is ```C:\Program Files (x86)\Steam\steamapps\common\Factorio\doc-html```

If for some reason you need to, download the docs([direct link](https://lua-api.factorio.com/latest/static/archive.zip)) or go to the [API docs](https://lua-api.factorio.com/latest/) and download from the link in the bottom (same thing as the direct link).

Open that folder in a terminal and  run the following command to generate the files and put them wherever you like:

```fmtk luals-addon -d runtime-api.json -p prototype-api.json "C:/Libraries/"```

To be clear, you can replace `runtime-api.json` and `prototype-api.json` with paths to the corresponding files in the `Factorio/doc-html/` folder which would allow you to run this command from anywhere, this is just more convenient.

# Recommended method

Open your .luarc.json file (or make one) in the root (same place as your info.json) of your mod's folder and make sure you have this in there:

```json
{
  "workspace.library": [
  (Rest of library),
  "C:/Libraries/factorio/",
  (Rest of library)
  ]
}
```
  
# Including it in your LSP configuration (Neovim)

I recommend the above method with the .luarc.json file because this method is very fragile, it can break due to how lsp configurations are loaded (see [Neovim documentation](https://neovim.io/doc/user/lsp.html#lsp-config) for loading priorities) but if for some reason you need it to be loaded globally:

Using vim.lsp.config() (Neovim 0.11.0+):

```lua
vim.lsp.config("lua_ls", {
  settings = {
    Lua = {
      workspace = {
        library = {
          [vim.fn.expand "C:/Libraries"] = true,
        },
      },
    },
  },
})
```

Calling lspconfig.[server_name].setup (pre Neovim 0.11.0):

```lua
lspconfig.lua_ls.setup {
  settings = {
    Lua = {
      workspace = {
        library = {
          [vim.fn.expand "C:/Libraries"] = true,
        },
      },
    },
  },
}
```

This method will not work if you are using Lazydev.nvim as that will overwrite your lsp configuration's library, you could try to set the `enabled` option in your Lazydev [opts](https://github.com/folke/lazydev.nvim?tab=readme-ov-file#%EF%B8%8F-configuration) to something complex but there is an example provided that disables the plugin when a .luarc.json file is found. It should look something like this (this works as of 02/05/2025): 

```lua
{
  "folke/lazydev.nvim",
  ft = "lua", -- only load on lua files
  opts = {
    -- disable when a .luarc.json file is found
    enabled = function(root_dir)
      return not vim.uv.fs_stat(root_dir .. "/.luarc.json")
    end,
  },
},
```
