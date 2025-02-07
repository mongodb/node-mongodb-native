#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

# the default connection string, may be overridden by the environment script
export MONGODB_URI="mongodb://localhost:27017/aws"

source .evergreen/setup-mongodb-aws-auth-tests.sh

# load node.js environment
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

npm run check:lambda:aws
