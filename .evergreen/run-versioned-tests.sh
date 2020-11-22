#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

DRIVER_VERSION=$1
echo "MONGODB_URI=$MONGODB_URI VERSION=$VERSION TOPOLOGY=$TOPOLOGY AUTH=$AUTH SSL=$SSL"
echo "PLATFORM=$PLATFORM DRIVER_VERSION=$DRIVER_VERSION"

if [[ $TOPOLOGY == "server" ]]; then
  LEGACY_ENVIRONMENT='single'
else
  LEGACY_ENVIRONMENT=$TOPOLOGY
fi

case $DRIVER_VERSION in
  '3.6')
    VERSION_DESC="v3.6"
    TEST_COMMAND='npm run test-nolint'
    ;;
  'fix-srv-test-timeout')
    VERSION_DESC="v3.6 (debug branch)"
    TEST_COMMAND='npm run test-nolint'
    ;;
  '3.3')
    VERSION_DESC="v3.3"
    TEST_COMMAND='npm run test-nolint'
    ;;
  '3.1')
    VERSION_DESC="v3.1"
    MONGODB_VERSION=$VERSION
    TEST_COMMAND="./node_modules/.bin/mongodb-test-runner -s -l test/unit test/functional"
    ;;
  *)
    echo "Unsupported driver version: $DRIVER_VERSION"
    exit 1
    ;;
esac

echo "Testing NodeJS driver $VERSION_DESC"
echo "TEST_COMMAND=$TEST_COMMAND"

export PROJECT_DIRECTORY=$(cd $(dirname ${BASH_SOURCE[0]}) && cd .. && pwd)
export NODE_LTS_NAME=dubnium
export SKIP_INSTALL=1

if [[ $OS == "Windows_NT" || $PLATFORM == "windows-64" ]]; then
  export PROJECT_DIRECTORY=`cygpath -w "$PROJECT_DIRECTORY"`
fi

echo "PROJECT_DIRECTORY=$PROJECT_DIRECTORY NODE_LTS_NAME=$NODE_LTS_NAME"

cd $PROJECT_DIRECTORY

echo "1. Installing driver depenencies"
bash .evergreen/install-dependencies.sh
echo "2. Driver dependencies installed, running test suite"

git checkout $DRIVER_VERSION
echo "3. Checked out version branch, running dependency installation"

npm install --unsafe-perm
echo "4. Library dependencies installed, running test suite"
$TEST_COMMAND
