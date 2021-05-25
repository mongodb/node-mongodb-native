#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

[ -s "$PROJECT_DIRECTORY/node-artifacts/nvm/nvm.sh" ] && source "$PROJECT_DIRECTORY"/node-artifacts/nvm/nvm.sh

npm install bson-ext

export MONGODB_URI=${MONGODB_URI}

npm run check:test
