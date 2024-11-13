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
pushd "$DRIVERS_TOOLS"/.evergreen/csfle
. ./activate-kmstlsvenv.sh
. ./set-temp-creds.sh
popd

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

popd # libmongocrypt/bindings/node
popd # ../csfle-deps-tmp

# copy mongodb-client-encryption into driver's node_modules
cp -R ../csfle-deps-tmp/libmongocrypt/bindings/node node_modules/mongodb-client-encryption

export MONGODB_URI=${MONGODB_URI}
export KMIP_TLS_CA_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/ca.pem"
export KMIP_TLS_CERT_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/client.pem"
export TEST_CSFLE=true

set +o errexit # We want to run both test suites even if the first fails
npm run check:csfle
DRIVER_CSFLE_TEST_RESULT=$?
set -o errexit

# Great! our drivers tests ran
# there are tests inside the bindings repo that we also want to check

pushd ../csfle-deps-tmp/libmongocrypt/bindings/node

# a mongocryptd was certainly started by the driver tests,
# let us let the bindings tests start their own
killall mongocryptd || true

# only prod deps were installed earlier, install devDependencies here (except for mongodb!)
npm install --ignore-scripts

# copy mongodb into CSFLE's node_modules
rm -rf node_modules/mongodb
cp -R "$ABS_PATH_TO_PATCH" node_modules/mongodb
pushd node_modules/mongodb
# lets be sure we have compiled TS since driver tests don't need to compile
npm run build:ts
popd # node_modules/mongodb

# this variable needs to be empty
export MONGODB_NODE_SKIP_LIVE_TESTS=""
# all of the below must be defined (as well as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)
export AWS_REGION="us-east-1"
export AWS_CMK_ID="arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"

npm test -- --colors

popd # ../csfle-deps-tmp/libmongocrypt/bindings/node

# Exit the script in a way that will show evergreen a pass or fail
if [ $DRIVER_CSFLE_TEST_RESULT -ne 0 ]; then
  echo "Driver tests failed, look above for results"
  exit 1
fi
