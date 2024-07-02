#! /usr/bin/env bash
set +o xtrace # Do not write AWS credentials to stderr

# Initiail checks for running these tests
if [ -z ${INSTALL_DIR+omitted} ]; then echo "INSTALL_DIR is unset" && exit 1; fi
if [ -z ${PROJECT_DIRECTORY+omitted} ]; then echo "PROJECT_DIRECTORY is unset" && exit 1; fi

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

CWD=$(pwd)

rm -rf $INSTALL_DIR
git clone https://github.com/mongodb-js/mongodb-client-encryption.git $INSTALL_DIR
cd $INSTALL_DIR

if [ -n "${LIBMONGOCRYPT_VERSION}" ]; then
	# nightly tests test with `latest` to test against the laster FLE build.
    npm run install:libmongocrypt -- --libVersion $LIBMONGOCRYPT_VERSION
else
	# otherwise use whatever is specified in the package.json.
    npm run install:libmongocrypt
fi

echo "finished installing libmongocrypt"
BINDINGS_DIR=$(pwd)

cd $CWD

echo "linking mongodb-client-encrytion"
npm link $BINDINGS_DIR
