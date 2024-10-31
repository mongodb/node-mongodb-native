#! /usr/bin/env bash

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Initial checks for running these tests
if [ -z ${PROJECT_DIRECTORY+omitted} ]; then echo "PROJECT_DIRECTORY is unset" && exit 1; fi

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

rm -rf mongodb-client-encryption
git clone https://github.com/mongodb-js/mongodb-client-encryption.git
pushd mongodb-client-encryption

node --version
npm --version

if [ -n "${LIBMONGOCRYPT_VERSION}" ]; then
	# nightly tests test with `latest` to test against the laster FLE build.
    npm run install:libmongocrypt -- --build --libVersion $LIBMONGOCRYPT_VERSION
else
	# otherwise use whatever is specified in the package.json.
    npm run install:libmongocrypt
fi

echo "finished installing libmongocrypt"

popd

echo "linking mongodb-client-encrytion"
npm link ./mongodb-client-encryption
