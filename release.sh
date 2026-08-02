#!/bin/bash
set -xeuo pipefail
npm login justarandomgeek

npm pack
VERSION=`jq -r .version package.json`
git tag -a "$VERSION" -F - <<TAG_EOF
$VERSION
$(sed -n '/## '"$VERSION"'/,/##/{ /##/!p }' CHANGELOG.md)
TAG_EOF
git fetch . next:current
npm version patch --git-tag-version=false
NEWVERSION=`jq -r .version package.json`
sed -i '/## '"$VERSION"'/i \## '"$NEWVERSION"'\n' CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "moved to $NEWVERSION"

npm publish "./factoriomod-debug-$VERSION.tgz"
npx vsce publish --packagePath "./factoriomod-debug-$VERSION.vsix"
git push self "$VERSION" next current
git push origin "$VERSION" next current
