#! /usr/bin/env bash
set +o xtrace # Do not write AWS credentials to stderr

# Initiail checks for running these tests
if [ -z ${AWS_ACCESS_KEY_ID+omitted} ]; then echo "AWS_ACCESS_KEY_ID is unset" && exit 1; fi
if [ -z ${AWS_SECRET_ACCESS_KEY+omitted} ]; then echo "AWS_SECRET_ACCESS_KEY is unset" && exit 1; fi
if [ -z ${CSFLE_KMS_PROVIDERS+omitted} ]; then echo "CSFLE_KMS_PROVIDERS is unset" && exit 1; fi

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export CSFLE_KMS_PROVIDERS=${CSFLE_KMS_PROVIDERS}
export CRYPT_SHARED_LIB_PATH=${CRYPT_SHARED_LIB_PATH}
echo "csfle CRYPT_SHARED_LIB_PATH: $CRYPT_SHARED_LIB_PATH"

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Get access to the AWS temporary credentials:
echo "adding temporary AWS credentials to environment"
# CSFLE_AWS_TEMP_ACCESS_KEY_ID, CSFLE_AWS_TEMP_SECRET_ACCESS_KEY, CSFLE_AWS_TEMP_SESSION_TOKEN
. "$DRIVERS_TOOLS"/.evergreen/csfle/set-temp-creds.sh

ABS_PATH_TO_PATCH=$(pwd)

# Environment Variables:
# CSFLE_GIT_REF - set the git reference to checkout for a custom CSFLE version
# CDRIVER_GIT_REF - set the git reference to checkout for a custom CDRIVER version (this is for libbson)
CSFLE_GIT_REF=${CSFLE_GIT_REF:-master}
CDRIVER_GIT_REF=${CDRIVER_GIT_REF:-1.17.6}

rm -rf ../csfle-deps-tmp
mkdir -p ../csfle-deps-tmp
pushd ../csfle-deps-tmp

rm -rf libmongocrypt mongo-c-driver

git clone https://github.com/mongodb/libmongocrypt.git
pushd libmongocrypt
git fetch --tags
git checkout "$CSFLE_GIT_REF" -b csfle-custom
echo "checked out libmongocrypt at $(git rev-parse HEAD)"
popd # libmongocrypt

git clone https://github.com/mongodb/mongo-c-driver.git
pushd mongo-c-driver
git fetch --tags
git checkout "$CDRIVER_GIT_REF" -b cdriver-custom
echo "checked out C driver at $(git rev-parse HEAD)"
popd # mongo-c-driver

pushd libmongocrypt/bindings/node

npm install --production --ignore-scripts
bash ./etc/build-static.sh

npm run rebuild # just in case this is necessary?

BINDINGS_DIR=$(pwd)
popd # libmongocrypt/bindings/node
popd # ../csfle-deps-tmp

# copy mongodb-client-encryption into driver's node_modules
npm link $BINDINGS_DIR

export MONGODB_URI=${MONGODB_URI}
export KMIP_TLS_CA_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/ca.pem"
export KMIP_TLS_CERT_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/client.pem"
export TEST_CSFLE=true

npm run check:csfle
