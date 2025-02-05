#! /usr/bin/env bash
set +o xtrace # Do not write AWS credentials to stderr

source .evergreen/setup-fle.sh

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

set -o xtrace  # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

export MONGODB_URI=${MONGODB_URI}
export TEST_CSFLE=true

npm run check:csfle
