#! /bin/bash

set -o errexit
set -o xtrace
set -o nounset

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export MONGODB_URI=$MONGODB_URI
export MONGODB_CLIENT_OPTIONS=$MONGODB_CLIENT_OPTIONS

npm run build:ts
npm run check:bench
