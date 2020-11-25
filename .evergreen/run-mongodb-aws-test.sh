#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

# ensure no secrets are printed in log files
set +x

# load node.js environment
export NVM_DIR="${PROJECT_DIRECTORY}/node-artifacts/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# the default connection string, may be overridden by the environment script
export MONGODB_URI="mongodb://localhost:27017/aws?authMechanism=MONGODB-AWS"

# load the script
shopt -s expand_aliases # needed for `urlencode` alias
[ -s "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh" ] && source "$PROJECT_DIRECTORY/prepare_mongodb_aws.sh"

# revert to show test output
set -x

npm install aws4
MONGODB_UNIFIED_TOPOLOGY=1 npx mocha test/functional/mongodb_aws.test.js
