#!/bin/bash
# Run this script after committing an updated info.json to automatically tag the update and prepare a zip of it.

# Get mod name and version from info.json
# https://stedolan.github.io/jq/
modname=`cat info.json|jq -r .name`
modver=`cat info.json|jq -r .version`

# Create git tag for this version
git tag "$modver"

# Prepare zip for Factorio native use and mod portal
git archive --prefix "${modname}_$modver/" -o "${modname}_$modver.zip" HEAD
