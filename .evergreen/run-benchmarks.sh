#! /bin/bash

set -o errexit
set -o xtrace
set -o nounset

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export MONGODB_URI=$MONGODB_URI
export MONGODB_CLIENT_OPTIONS=$MONGODB_CLIENT_OPTIONS

npm run build:ts

# If MONGODB_CLIENT_OPTIONS contains mongodbLogComponentSeverities redirect stderr to a file
if [[ $MONGODB_CLIENT_OPTIONS == *"mongodbLogComponentSeverities"* ]]; then
  npm run check:bench 2> bench.log
else
  npm run check:bench
fi
