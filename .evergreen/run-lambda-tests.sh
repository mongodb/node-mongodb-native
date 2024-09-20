#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

# ensure no secrets are printed in log files
set +x

# load node.js environment
source ./.drivers-tools/.evergreen/init-node-and-npm-env.sh

npm run check:lambda
