#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

MONGODB_URI=${MONGODB_URI:-"mongodb://127.0.0.1:27017"}
MONGODB_URI_SINGLE="${MONGODB_URI}/?authMechanism=MONGODB-OIDC&authMechanismProperties=DEVICE_NAME:aws"

echo $MONGODB_URI_SINGLE

export MONGODB_URI="$MONGODB_URI_SINGLE"

npm run check:oidc
