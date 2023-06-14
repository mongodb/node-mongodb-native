#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

PROVIDER_NAME=${PROVIDER_NAME:-"aws"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

MONGODB_URI=${MONGODB_URI:-"mongodb://127.0.0.1:27017"}

export OIDC_TOKEN_DIR=${OIDC_TOKEN_DIR}

export MONGODB_URI=${MONGODB_URI:-"mongodb://localhost"}

if [ "$PROVIDER_NAME" = "aws" ]; then
  export MONGODB_URI_SINGLE="${MONGODB_URI}/?authMechanism=MONGODB-OIDC"
  export MONGODB_URI_MULTIPLE="${MONGODB_URI}:27018/?authMechanism=MONGODB-OIDC&directConnection=true"

  if [ -z "${OIDC_TOKEN_DIR}" ]; then
    echo "Must specify OIDC_TOKEN_DIR"
    exit 1
  fi
  npm run check:oidc
elif [ "$PROVIDER_NAME" = "azure" ]; then
  if [ -z "${AZUREOIDC_CLIENTID}" ]; then
    echo "Must specify an AZUREOIDC_CLIENTID"
    exit 1
  fi
  MONGODB_URI="${MONGODB_URI}/?authMechanism=MONGODB-OIDC"
  MONGODB_URI="${MONGODB_URI}&authMechanismProperties=PROVIDER_NAME:azure"
  export MONGODB_URI="${MONGODB_URI},TOKEN_AUDIENCE:api%3A%2F%2F${AZUREOIDC_CLIENTID}"
  npm run check:oidc-azure
else
  npm run check:oidc
fi
