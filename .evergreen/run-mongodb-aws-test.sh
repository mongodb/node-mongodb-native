#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

# ensure no secrets are printed in log files
set +x

# load node.js environment
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

# the default connection string, may be overridden by the environment script
export MONGODB_URI="mongodb://localhost:27017/aws?authMechanism=MONGODB-AWS"

# load the script
shopt -s expand_aliases # needed for `urlencode` alias
[ -s "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh" ] && source "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh"

# revert to show test output
set -x

npm install aws4
if [ $MONGODB_AWS_SDK = 'false' ]; then rm -rf ./node_modules/@aws-sdk/credential-providers; fi
npm run check:aws
