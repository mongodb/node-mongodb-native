#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       AUTH                    Set to enable authentication. Defaults to "noauth"
#       SSL                     Set to enable SSL. Defaults to "nossl"
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       MARCH                   Machine Architecture. Defaults to lowercase uname -m
#       SKIP_DEPS               Skip installing dependencies
#       TEST_CSFLE              Set to enforce running csfle tests

AUTH=${AUTH:-noauth}
MONGODB_URI=${MONGODB_URI:-}
COMPRESSOR=${COMPRESSOR:-}
SKIP_DEPS=${SKIP_DEPS:-true}

if [ "${CLIENT_ENCRYPTION}" == "true" ]; then
  export RUN_WITH_MONGOCRYPTD
  source .evergreen/setup-fle.sh
elif [ "${CLIENT_ENCRYPTION}" != "false" ]; then
  echo "Invalid configuration for CLIENT_ENCRYPTION: ${CLIENT_ENCRYPTION}"
  exit 1
fi

# ssl setup
SSL=${SSL:-nossl}
if [ "$SSL" != "nossl" ]; then
    export TLS_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
    export TLS_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"
fi

# run tests
echo "Running $AUTH tests over $SSL, connecting to $MONGODB_URI"

if [[ -z "${SKIP_DEPS}" ]]; then
  source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"
else
  source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
fi

if [ "$COMPRESSOR" != "" ]; then
  if [[ "$MONGODB_URI" == *"?"* ]]; then
    export MONGODB_URI="${MONGODB_URI}&compressors=${COMPRESSOR}"
  else
    export MONGODB_URI="${MONGODB_URI}/?compressors=${COMPRESSOR}"
  fi
fi

npm install @mongodb-js/zstd
npm install snappy

export AUTH=$AUTH
export SINGLE_MONGOS_LB_URI=${SINGLE_MONGOS_LB_URI}
export MULTI_MONGOS_LB_URI=${MULTI_MONGOS_LB_URI}
export MONGODB_API_VERSION=${MONGODB_API_VERSION}
export MONGODB_URI=${MONGODB_URI}
export LOAD_BALANCER=${LOAD_BALANCER}
export TEST_CSFLE=${TEST_CSFLE}
export COMPRESSOR=${COMPRESSOR}

# OOM exit code investigation - run through each layer and log exit codes
set +e

OOM_TEST="test/integration/oom.test.ts"

echo "========================================="
echo "Layer 1: direct mocha"
echo "========================================="
npx mocha --config test/mocha_mongodb.js "$OOM_TEST"
echo "EXIT CODE: $?"

echo "========================================="
echo "Layer 2: npm run check:test (npm -> mocha)"
echo "========================================="
npm run check:test -- "$OOM_TEST"
echo "EXIT CODE: $?"

echo "========================================="
echo "Layer 3: nyc mocha (nyc -> mocha, no npm)"
echo "========================================="
npx nyc mocha --config test/mocha_mongodb.js "$OOM_TEST"
echo "EXIT CODE: $?"

echo "========================================="
echo "Layer 4: nyc npm run check:test (nyc -> npm -> mocha)"
echo "========================================="
npx nyc npm run check:test -- "$OOM_TEST"
echo "EXIT CODE: $?"

echo "========================================="
echo "Layer 5: npm run check:integration-coverage (npm -> nyc -> npm -> mocha)"
echo "========================================="
npm run check:integration-coverage -- "$OOM_TEST"
echo "EXIT CODE: $?"

echo "========================================="
echo "DONE - any EXIT CODE of 0 above means that layer swallows the OOM"
echo "========================================="
exit 1
