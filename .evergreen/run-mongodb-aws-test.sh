#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

echo "NEW SCRIPT"
echo "TESTER: $AWS_CREDENTIAL_TYPE"

bash $DRIVERS_TOOLS/.evergreen/auth_aws/setup-secrets.sh

BEFORE=$(pwd)

cd $DRIVERS_TOOLS/.evergreen/auth_aws

# Create a python virtual environment.
. ./activate-authawsvenv.sh
# Source the environment variables. Configure the environment and the server.
. aws_setup.sh $AWS_CREDENTIAL_TYPE

cd $BEFORE

# load node.js environment
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

echo "******** After Install: $(pwd)"

npm install --no-save aws4

if [ $MONGODB_AWS_SDK = 'false' ]; then rm -rf ./node_modules/@aws-sdk/credential-providers; fi

npm run check:aws
