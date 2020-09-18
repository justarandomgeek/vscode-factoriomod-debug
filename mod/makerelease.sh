#!/bin/bash
cd "$(dirname "$0")"

# Get mod name and version from info.json
# https://stedolan.github.io/jq/
modname=`jq -r .name info.json`
modver=`jq -r .version info.json`

mkdir -p "../modpackage/"

git archive --prefix "${modname}_$modver/" -o "../modpackage/${modname}.zip" HEAD

echo "{}" > ../modpackage/mods.json
# jq can't read from and write to the same file - write to temp and overwrite...
jq ".debugadapter={\"version\":\"${modver}\",\"debugOnly\":true,\"deleteOld\":true}" ../modpackage/mods.json >../modpackage/mods.tmp
mv ../modpackage/mods.tmp ../modpackage/mods.json