#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

export GCPOIDC_DRIVERS_TAR_FILE=/tmp/node-mongodb-native.tgz
cd ..
tar -czf $GCPOIDC_DRIVERS_TAR_FILE src drivers-tools
cd -
export GCPOIDC_TEST_CMD="cd src && source ./secrets-export.sh drivers/gcpoidc && ENVIRONMENT=gcp ./.evergreen/${SCRIPT}"
export PROJECT_DIRECTORY=$PROJECT_DIRECTORY
export ENVIRONMENT=$ENVIRONMENT
bash $DRIVERS_TOOLS/.evergreen/auth_oidc/gcp/run-driver-test.sh
