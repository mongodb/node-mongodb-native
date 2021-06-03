#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       SSL                     Set to enable SSL. Defaults to "nossl"
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       TEST_NPM_SCRIPT         Script to npm run. Defaults to "check:test"
#       SKIP_DEPS               Skip installing dependencies
#       NO_EXIT                 Don't exit early from tests that leak resources

MONGODB_URI=${MONGODB_URI:-}
TEST_NPM_SCRIPT=${TEST_NPM_SCRIPT:-check:test}
if [[ -z "${NO_EXIT}" ]]; then
  TEST_NPM_SCRIPT="$TEST_NPM_SCRIPT -- --exit"
fi

# ssl setup
SSL=${SSL:-nossl}
if [ "$SSL" != "nossl" ]; then
   export SSL_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
   export SSL_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"
fi

# run tests
echo "Running $AUTH tests over $SSL, connecting to $MONGODB_URI"

if [[ -z "${SKIP_DEPS}" ]]; then
  source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"
else
  export PATH="/opt/mongodbtoolchain/v2/bin:$PATH"
  NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
  export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
  if [[ "$OS" == "Windows_NT" ]]; then
    NVM_HOME=$(cygpath -m -a "$NVM_DIR")
    export NVM_HOME
    NVM_SYMLINK=$(cygpath -m -a "$NODE_ARTIFACTS_PATH/bin")
    export NVM_SYMLINK
    NVM_ARTIFACTS_PATH=$(cygpath -m -a "$NODE_ARTIFACTS_PATH/bin")
    export NVM_ARTIFACTS_PATH
    PATH=$(cygpath $NVM_SYMLINK):$(cygpath $NVM_HOME):$PATH
    export PATH
    echo "updated path on windows PATH=$PATH"
  else
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi
  echo "initializing NVM, NVM_DIR=$NVM_DIR"
fi

npm install bson-ext

export MONGODB_API_VERSION=${MONGODB_API_VERSION}
export MONGODB_URI=${MONGODB_URI}

npm run "${TEST_NPM_SCRIPT}"
