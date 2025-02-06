#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

source .evergreen/setup-mongodb-aws-auth-tests.sh

# load node.js environment
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

npm run check:aws
