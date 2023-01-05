#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

npm cache clear --force || true
npm i -g npm@8.x || true

npm pack | tee npm-pack.log

npm cache clear --force || true
npm i -g npm@8.x || true

rm -rf "js-bson"
git clone --depth=1 https://github.com/mongodb/js-bson.git -b "NODE-4892-version-tag"
pushd "js-bson"
npm install
npm pack | tee npm-pack.log
BSON_TARBALL_FILENAME="$(tail -n1 npm-pack.log)"
mv "$BSON_TARBALL_FILENAME" ..
popd

export TARBALL_FILENAME="$(tail -n1 npm-pack.log)"
# cd /tmp
git clone --depth=10 https://github.com/nbbeeken/mongosh.git -b "test-bson-v5"
cd mongosh
export REPLACE_PACKAGE="mongodb:${PROJECT_DIRECTORY}/${TARBALL_FILENAME},bson:${PROJECT_DIRECTORY}/${BSON_TARBALL_FILENAME}"

npm run test-nodedriver
