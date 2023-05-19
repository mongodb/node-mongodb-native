#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

PROVIDER_NAME=${PROVIDER_NAME:-"aws"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

MONGODB_URI=${MONGODB_URI:-"mongodb://127.0.0.1:27017"}

export OIDC_TOKEN_DIR=${OIDC_TOKEN_DIR}

if [ "$PROVIDER_NAME" = "azure" ]; then
  npm run check:oidc-azure
else
  npm run check:oidc
fi