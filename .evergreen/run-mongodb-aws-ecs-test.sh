#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

export MONGODB_URI="$1"
PROJECT_DIRECTORY="$(pwd)/src"

# untar packed archive
cd $PROJECT_DIRECTORY
tar -xzf src.tgz .

# load node.js
set +x
source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"
set -x

# run the tests
npm install aws4

npm run check:aws
