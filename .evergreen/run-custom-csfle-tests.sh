#! /usr/bin/env bash

# Initiail checks for running these tests
if [ -z ${AWS_ACCESS_KEY_ID+omitted} ]; then echo "AWS_ACCESS_KEY_ID is unset" && exit 1; fi
if [ -z ${AWS_SECRET_ACCESS_KEY+omitted} ]; then echo "AWS_SECRET_ACCESS_KEY is unset" && exit 1; fi
if [ -z ${CSFLE_KMS_PROVIDERS+omitted} ]; then echo "CSFLE_KMS_PROVIDERS is unset" && exit 1; fi

[ -s "$PROJECT_DIRECTORY/node-artifacts/nvm/nvm.sh" ] && source "$PROJECT_DIRECTORY"/node-artifacts/nvm/nvm.sh

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Environment Variables:
# CSFLE_GIT_REF - set the git reference to checkout for a custom CSFLE version
# CDRIVER_GIT_REF - set the git reference to checkout for a custom CDRIVER version (this is for libbson)

CSFLE_GIT_REF=${CSFLE_GIT_REF:-master}
CDRIVER_GIT_REF=${CDRIVER_GIT_REF:-1.17.4}

rm -rf csfle-deps-tmp
mkdir -p csfle-deps-tmp
pushd csfle-deps-tmp

rm -rf libmongocrypt mongo-c-driver

git clone https://github.com/mongodb/libmongocrypt.git
pushd libmongocrypt
git fetch --tags
git checkout "$CSFLE_GIT_REF" -b csfle-custom
popd # libmongocrypt

git clone https://github.com/mongodb/mongo-c-driver.git
pushd mongo-c-driver
git fetch --tags
git checkout "$CDRIVER_GIT_REF" -b cdriver-custom
popd # mongo-c-driver

pushd libmongocrypt/bindings/node

source ./.evergreen/find_cmake.sh
bash ./etc/build-static.sh

popd # libmongocrypt/bindings/node
popd # csfle-deps-tmp

npm install

cp -r csfle-deps-tmp/libmongocrypt/bindings/node node_modules/mongodb-client-encryption

export MONGODB_UNIFIED_TOPOLOGY=${UNIFIED}
export MONGODB_URI=${MONGODB_URI}
npx mocha test/functional/client_side_encryption
