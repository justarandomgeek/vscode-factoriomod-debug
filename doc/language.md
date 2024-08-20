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

You can also use [`nvim-treesitter`](https://github.com/nvim-treesitter/nvim-treesitter) to add syntax parsing and highlighting to the locale and changelog files. To do that, you will need to use the [locale](https://github.com/JohnTheCoolingFan/tree-sitter-factorio-locale) and [changelog](https://github.com/JohnTheCoolingFan/tree-sitter-factorio-changelog) custom parsers:

```lua
local parser_configs = require("nvim-treesitter.parsers").get_parser_configs()

parser_configs.factorio_changelog = {
    install_info = {
        url = "~/projects/tree-sitter/tree-sitter-factorio-changelog",
        files = { "src/parser.c" },
        generate_requires_npm = false,
    },
    filetype = "factorio-changelog",
}

parser_configs.factorio_locale = {
    install_info = {
        url = "~/projects/tree-sitter/tree-sitter-factorio-locale",
        files = { "src/parser.c" },
        generate_requires_npm = false,
    },
    filetype = "factorio-locale",
}
```

These provide only syntax parsing, not highlighting. Currently there are no concerete syntax highlight configurations for these parsers, but you can make your own! Consult `:h treesitter-highlight` for details. Basically you crate two files: `~/.config/nvim/afetr/queries/factorio_{changelog,locale}/highlights.scm`, which define what highlight groups are used for syntax nodes. You can inspect what a syntax node represents using `:InspectTree` on an open file.

Here's a little example for bringing some highlight to changelog files:
```scm
(delimeter) @punctuation.special
(version_literal) @number
(date_literal) @string
(change_category_name) @text.title
```

The name in brackets on teh left matches to teh syntax node name and the `@group` on the right is the syntax group. You can see the whole mapping at `:h treesitter-highlight-groups`, and to see each highlight group and its example usage, use `:highlight`
