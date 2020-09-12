#!/bin/bash
# Run this script after committing an updated info.json to automatically tag the update and prepare a zip of it.

cd "$(dirname "$0")"

# Get mod name and version from info.json
# https://stedolan.github.io/jq/
modname=`jq -r .name info.json`
modver=`jq -r .version info.json`

# Prepare zip for Factorio native use and mod portal
git archive --prefix "${modname}_$modver/" -o "${modname}_$modver.zip" HEAD

cp "${modname}_$modver.zip" "../modpackage/${modname}.zip"

echo "{}" > ../modpackage/mods.json
# jq can't read from and write to the same file - write to temp and overwrite...
jq ".debugadapter={\"version\":\"${modver}\",\"debugOnly\":true,\"deleteOld\":true}" ../modpackage/mods.json >../modpackage/mods.tmp
mv ../modpackage/mods.tmp ../modpackage/mods.json