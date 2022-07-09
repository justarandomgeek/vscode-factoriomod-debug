# Automatic Mod Packaging and Publishing

Mods can be automatically Packaged and Published from the "Factorio Mod Packages" panel (in SCM view by default, View->Open View...-> "Factorio Mod Packages" if you can't find it).

## API Key

Uploading to the mod portal requires an API key with the `ModPortal: Upload Mods` usage, which can be created on https://factorio.com/profile. You will be prompted for this key when it is first required.

## Tasks

These tasks can also be accessed in VSCode's Tasks system. Custom scripts will run inside the mod directory and have the environment variables `FACTORIO_MODNAME` and `FACTORIO_MODVERSION` provided.

### Datestamp
  * if changelog.txt present and has a section for the current version, update its date to today
  * run `info.json#/package/scripts/datestamp` if set

### Compile
  Compile tasks will be automatically run when starting a debug session if defined.

  * run `info.json#/package/scripts/compile` if set

### Package
  * run `info.json#/package/scripts/compile` if set
  * run `info.json#/package/scripts/prepackage` if set
  * build a zip including all files in the mod directory except dotfiles, zip files, and files matching the list of globs in `info.json#/package/ignore`.

### Increment Version
  * increment version in info.json
  * if changelog.txt present, add new empty section to changelog.txt
  * run `info.json#/package/scripts/version` if set

### Upload
  * select a package in mod directory
  * upload to mod portal

### Publish

All-in-one command.

  * verify no uncommitted changes, on `master` (or branch set in `info.json#/package/git_publish_branch`)
  * run `info.json#/package/scripts/prepublish` if set
  * run **Datestamp**
  * git commit "preparing release of version x.y.z", tag x.y.z
  * run **Package**
  * git tag, unless `info.json#/package/no_git_tag` is set
  * run **Increment Version**
  * run `info.json#/package/scripts/publish` if set
  * commit "moved to version x.y.z"
  * push to git upstream, unless `info.json#/package/no_git_push` is set
  * upload to mod portal, unless `info.json#/package/no_portal_upload` is set
  * run `info.json#/package/scripts/postpublish` if set, with extra environment variable `FACTORIO_MODPACKAGE` with the filename of the built zip.
  * remove zip if `factorio.package.removeZipAfterPublish` is set
