#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

# ensure no secrets are printed in log files
set +x

if [ -z ${MONGODB_URI+omitted} ]; then echo "MONGODB_URI is unset" && exit 1; fi
if [ -z ${DRIVERS_TOOLS+omitted} ]; then echo "DRIVERS_TOOLS is unset" && exit 1; fi
if [ -z ${AWS_CREDENTIAL_TYPE+omitted} ]; then echo "AWS_CREDENTIAL_TYPE is unset" && exit 1; fi
if [ -z ${MONGODB_AWS_SDK+omitted} ]; then echo "MONGODB_AWS_SDK is unset" && exit 1; fi

bash $DRIVERS_TOOLS/.evergreen/auth_aws/setup-secrets.sh

BEFORE=$(pwd)

cd $DRIVERS_TOOLS/.evergreen/auth_aws

# Create a python virtual environment.
. ./activate-authawsvenv.sh
# Source the environment variables. Configure the environment and the server.
. aws_setup.sh $AWS_CREDENTIAL_TYPE

cd $BEFORE

npm install --no-save aws4

if [ $MONGODB_AWS_SDK = 'false' ]; then rm -rf ./node_modules/@aws-sdk/credential-providers; fi

# revert to show test output
set -x
