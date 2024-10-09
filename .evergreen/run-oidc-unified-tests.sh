#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd src
source ./.evergreen/prepare-shell.sh

ENVIRONMENT=${ENVIRONMENT:-"test"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

if [ "$ENVIRONMENT" = "test" ]; then
  export OIDC_TOKEN_DIR=${OIDC_TOKEN_DIR}
  export MONGODB_URI_SINGLE="${MONGODB_URI_SINGLE}&authMechanismProperties=ENVIRONMENT:test"
fi
export UTIL_CLIENT_USER=$OIDC_ADMIN_USER
export UTIL_CLIENT_PASSWORD=$OIDC_ADMIN_PWD

npm run check:oidc-auth
