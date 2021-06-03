#!/bin/bash

[ -s "$PROJECT_DIRECTORY/node-artifacts/nvm/nvm.sh" ] && source "$PROJECT_DIRECTORY"/node-artifacts/nvm/nvm.sh

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       SSL                     Set to enable SSL. Defaults to "nossl"
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       TEST_NPM_SCRIPT         Script to npm run. Defaults to "check:test"

MONGODB_URI=${MONGODB_URI:-}
TEST_NPM_SCRIPT=${TEST_NPM_SCRIPT:-check:test}

# ssl setup
SSL=${SSL:-nossl}
if [ "$SSL" != "nossl" ]; then
   export SSL_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
   export SSL_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"
fi

# run tests
echo "Running $AUTH tests over $SSL, connecting to $MONGODB_URI"

npm install bson-ext

export MONGODB_API_VERSION=${MONGODB_API_VERSION}
export MONGODB_URI=${MONGODB_URI}

npm run "${TEST_NPM_SCRIPT}"
