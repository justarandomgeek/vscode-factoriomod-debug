# Automatic Mod Packaging and Publishing

Mods can be automatically Packaged and Published from the "Factorio Mod Packages" panel (in SCM view by default, View->Open View...-> "Factorio Mod Packages" if you can't find it).

## API Key

Uploading to the mod portal requires an API key with the `ModPortal: Upload Mods` usage, which can be created on https://factorio.com/profile. You will be prompted for this key when it is first required.

## Tasks

These tasks can also be accessed in VSCode's Tasks system. Custom scripts will run inside the mod directory and have the environment variables `FACTORIO_MODNAME` and `FACTORIO_MODVERSION` provided. Tasks can also be run from command line with `fmtk`.

### Run Script
  * run any script from `info.json#/package/scripts[name]`

### Datestamp
  * if changelog.txt present and has a section for the current version, update its date to today
  * run `info.json#/package/scripts/datestamp` if set

### Package
  * run `info.json#/package/scripts/compile` if set
  * run `info.json#/package/scripts/prepackage` if set
  * build a zip including all files in the mod directory except dotfiles, zip files named `modname_*.zip`, and files matching the list of globs in `info.json#/package/ignore`. If you need to include other files, you can list additional root directories in `info.json#/package/extra`. You are responsible for ensuring that you don't include directories that result in two files of the same name in the zip! (Because my zip library doesn't tell me when this happens.)

### Increment Version
  * increment version in info.json
  * if changelog.txt present, add new empty section to changelog.txt
  * run `info.json#/package/scripts/version` if set

### Upload
  * select a package in mod directory
  * upload to mod portal

### Publish

All-in-one command.

  * verify no uncommitted changes, on default branch (`git config init.defaultBranch`, or branch set in `info.json#/package/git_publish_branch`)
  * run `info.json#/package/scripts/prepublish` if set
  * run **Datestamp**
  * git commit "preparing release of version x.y.z", tag x.y.z
  * run **Package**
  * git tag, unless `info.json#/package/no_git_tag` is set
  * run `info.json#/package/scripts/publish` if set
  * upload to mod portal, unless `info.json#/package/no_portal_upload` is set
  * run `info.json#/package/scripts/postpublish` if set, with extra environment variable `FACTORIO_MODPACKAGE` with the filename of the built zip in a temporary folder.
  * run **Increment Version**
  * commit "moved to version x.y.z"
  * push to git upstream, unless `info.json#/package/no_git_push` is set
