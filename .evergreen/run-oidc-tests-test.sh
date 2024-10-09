#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

cd src

source $DRIVERS_TOOLS/.evergreen/auth_oidc/secrets-export.sh
export PROJECT_DIRECTORY=$PROJECT_DIRECTORY
export ENVIRONMENT=$ENVIRONMENT
printenv
export AWS_WEB_IDENTITY_TOKEN_FILE=$OIDC_TOKEN_FILE
ls -la $OIDC_TOKEN_DIR
bash ./.evergreen/${SCRIPT}
