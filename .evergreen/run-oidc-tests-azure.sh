#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

export AZUREOIDC_DRIVERS_TAR_FILE=/tmp/node-mongodb-native.tgz
cd ..
tar -czf $AZUREOIDC_DRIVERS_TAR_FILE src
cd -
export AZUREOIDC_TEST_CMD="source ./env.sh && cd src && ENVIRONMENT=azure ./.evergreen/${SCRIPT}"
export PROJECT_DIRECTORY=$PROJECT_DIRECTORY
export ENVIRONMENT=$ENVIRONMENT
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/azure/run-driver-test.sh
