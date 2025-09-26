#! /usr/bin/env bash

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Initial checks for running these tests
if [ -z ${PROJECT_DIRECTORY+omitted} ]; then echo "PROJECT_DIRECTORY is unset" && exit 1; fi

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

rm -rf mongodb-client-encryption
git clone https://github.com/baileympearson/mongodb-client-encryption.git -b NODE-7216
pushd mongodb-client-encryption

npm run install:libmongocrypt

echo "finished installing libmongocrypt"

popd

echo "linking mongodb-client-encrytion"
npm link ./mongodb-client-encryption
