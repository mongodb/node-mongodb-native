#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       AUTH                    Set to enable authentication. Defaults to "noauth"
#       SSL                     Set to enable SSL. Defaults to "nossl"
#       UNIFIED                 Set to enable the Unified SDAM topology for the node driver
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       MARCH                   Machine Architecture. Defaults to lowercase uname -m
#       TEST_NPM_SCRIPT         Script to npm run. Defaults to "check:test"
#       SKIP_DEPS               Skip installing dependencies
#       NO_EXIT                 Don't exit early from tests that leak resources

AUTH=${AUTH:-noauth}
UNIFIED=${UNIFIED:-}
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
    export NVM_HOME=`cygpath -m -a "$NVM_DIR"`
    export NVM_SYMLINK=`cygpath -m -a "$NODE_ARTIFACTS_PATH/bin"`
    export NVM_ARTIFACTS_PATH=`cygpath -m -a "$NODE_ARTIFACTS_PATH/bin"`
    export PATH=`cygpath $NVM_SYMLINK`:`cygpath $NVM_HOME`:$PATH
    echo "updated path on windows PATH=$PATH"
  else
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
  echo "initializing NVM, NVM_DIR=$NVM_DIR"
fi

# only run FLE tets on hosts we explicitly choose to test on
if [[ -z "${CLIENT_ENCRYPTION}" ]]; then
  unset AWS_ACCESS_KEY_ID;
  unset AWS_SECRET_ACCESS_KEY;
else
  npm install mongodb-client-encryption
fi

MONGODB_UNIFIED_TOPOLOGY=${UNIFIED} MONGODB_URI=${MONGODB_URI} npm run ${TEST_NPM_SCRIPT}
