#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

# Supported/used environment variables:
#       AUTH                    Set to enable authentication. Defaults to "noauth"
#       MONGODB_URI             Set the suggested connection MONGODB_URI (including credentials and topology info)
#       MARCH                   Machine Architecture. Defaults to lowercase uname -m
#       SKIP_DEPS               Skip installing dependencies

AUTH=${AUTH:-noauth}
MONGODB_URI=${MONGODB_URI:-}
SKIP_DEPS=${SKIP_DEPS:-true}

# run tests
echo "Running $AUTH tests, connecting to $MONGODB_URI"

if [[ -z "${SKIP_DEPS}" ]]; then
  source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"
else
  source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
fi

export AUTH=$AUTH
export MONGODB_API_VERSION=${MONGODB_API_VERSION}
export MONGODB_URI=${MONGODB_URI}

npm run check:runtime-independency
