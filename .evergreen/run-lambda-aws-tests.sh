#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

# ensure no secrets are printed in log files
set +x

# load node.js environment
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

# the default connection string, may be overridden by the environment script
export MONGODB_URI="mongodb://localhost:27017/aws"

# load the script
shopt -s expand_aliases # needed for `urlencode` alias
[ -s "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh" ] && source "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh"

# revert to show test output
set -x

npm install aws4
npm run check:lambda:aws
