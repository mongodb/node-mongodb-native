#! /usr/bin/env bash

# Initiail checks for running these tests
if [ -z ${AWS_ACCESS_KEY_ID+omitted} ]; then echo "AWS_ACCESS_KEY_ID is unset" && exit 1; fi
if [ -z ${AWS_SECRET_ACCESS_KEY+omitted} ]; then echo "AWS_SECRET_ACCESS_KEY is unset" && exit 1; fi
if [ -z ${CSFLE_KMS_PROVIDERS+omitted} ]; then echo "CSFLE_KMS_PROVIDERS is unset" && exit 1; fi

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export CSFLE_KMS_PROVIDERS=${CSFLE_KMS_PROVIDERS}

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

npm install --ignore-scripts
rm -rf build prebuilds
npx node-gyp configure
npx node-gyp build
# make a global mongodb-client-encryption link
npm link

popd # libmongocrypt/bindings/node
popd # csfle-deps-tmp

npm install

npm link mongodb-client-encryption

export MONGODB_URI=${MONGODB_URI}
set +o errexit # We want to run both test suites even if the first fails
npx mocha test/functional/client_side_encryption
DRIVER_CSFLE_TEST_RESULT=$?
set -o errexit

# Great! our drivers tests pass but
# there are tests inside the bindings repo that we also want to check

pushd csfle-deps-tmp/libmongocrypt/bindings/node

# these tests will start their own
killall mongocryptd

npm install
# needs to be empty
export MONGODB_NODE_SKIP_LIVE_TESTS=""
# all of the below must be defined (as well as AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)
export AWS_REGION="us-east-1"
export AWS_CMK_ID="arn:aws:kms:us-east-1:579766882180:key/89fcc2c4-08b0-4bd9-9f25-e30687b580d0"
npm test

popd # libmongocrypt/bindings/node

# Exit the script in a way that will show evergreen a pass or fail
if [ $DRIVER_CSFLE_TEST_RESULT -ne 0 ]; then
  echo "Driver tests failed, look above for results"
  exit 1
fi
