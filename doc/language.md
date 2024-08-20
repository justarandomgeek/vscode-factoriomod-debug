# Changelog and Locale

## Syntax Highlighting

Syntax highlighting is provided for Changelog and Locale files with Textmate grammar, and snippets are provided for many common patterns.

## Changelog Language Server

The `fmtk lsp` language server provides support for changelog files, including document outline and syntax validation.

## Locale Language Server

The `fmtk lsp` language server provides support for locale files, including document outline and syntax validation.

In addition, locale keys are provided as completion items when typing strings in Lua, and "Go To Definition" is supported on locale key strings in Lua.

## Setting up in neovim with `lspconfig`

`fmtk lsp` looks for files with `languageId` of `factorio-changelog`, `factorio-locale` and `lua`. This corresponds to the filetype property (shown in the statusline on the right) in neovim and you will need to set this as a custom filetype.

Example configuration for `lspconfig` achieving that:

```lua
-- See `:h vim.filetype.add()` for more info
vim.filetype.add({
    -- Match by filename
    filename = {
        ['changelog.txt'] = 'factorio-changelog'
    },
    -- Match by path pattern
    pattern = {
        ['.*/locale/.*/.*%.cfg'] = 'factorio-locale'
    }
})

local lspconfig = require 'lspconfig'
local lsp_configs = require 'lspconfig.configs'

-- See `:h lspconfig-new` for more information on creating language server configs
if not lsp_configs.fmtk_lsp then
    lsp_configs.fmtk_lsp = {
        default_config = {
            -- The command to start the language server
            cmd = { 'npx', '--yes', 'factoriomod-debug', 'lsp', '--stdio' },
            -- The filetypes that the language server will be launched for
            filetypes = { 'factorio-changelog', 'factorio-locale', 'lua' },
            -- Hints to find the project root
            root_dir = lspconfig.util.root_pattern('changelog.txt', 'info.json'),
            -- Additional Language Server settings can be added here
            settings = {}
        }
    }
end
```

This example uses npx to automaticlaly download the latest version of `factoriomod-debug`, you will need to chnage the command if you have `factoriomod-debug` installed in your `$PATH`.

The changelog filetype may get overriden by another `ftplugin` script, which tou can see if you have `changelog` as your filetype (can be checked in statusline or with `:set filetype?`), use `:filter ftplugin scriptnames` to get the list of sourced `ftplugin` files. You can see where exactly the filetype has been modified using `:verbose set filetype?`. One possible workaround is to disable `vim-polyglot` plugin if it is enabled.
