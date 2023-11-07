#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

ENVIRONMENT=${ENVIRONMENT:-"aws"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

MONGODB_URI=${MONGODB_URI:-"mongodb://127.0.0.1:27017"}

export OIDC_TOKEN_DIR=${OIDC_TOKEN_DIR}

export MONGODB_URI=${MONGODB_URI:-"mongodb://localhost"}

if [ "$ENVIRONMENT" = "azure" ]; then
  if [ -z "${AZUREOIDC_CLIENTID}" ]; then
    echo "Must specify an AZUREOIDC_CLIENTID"
    exit 1
  fi

  set +x # don't leak credentials
  export UTIL_CLIENT_USER=$AZUREOIDC_USERNAME
  export UTIL_CLIENT_PASSWORD="pwd123"
  MONGODB_URI="${MONGODB_URI}/?authMechanism=MONGODB-OIDC"
  MONGODB_URI="${MONGODB_URI}&authMechanismProperties=ENVIRONMENT:azure"
  MONGODB_URI="${MONGODB_URI},TOKEN_AUDIENCE:api%3A%2F%2F${AZUREOIDC_CLIENTID}"
  export MONGODB_URI="${MONGODB_URI},TOKEN_CLIENT_ID:${AZUREOIDC_TOKENCLIENT}"
  set -x
elif [ "$ENVIRONMENT" = "gcp" ]; then
  if [ -z "${GCPOIDC_AUDIENCE}" ]; then
    echo "Must specify an GCPOIDC_AUDIENCE"
    exit 1
  fi
  if [ -z "${GCPOIDC_ATLAS_URI}" ]; then
    echo "Must specify an GCPOIDC_ATLAS_URI"
    exit 1
  fi

  set +x # don't leak credentials
  export UTIL_CLIENT_USER=$GCPOIDC_ATLAS_USER
  export UTIL_CLIENT_PASSWORD=$GCPOIDC_ATLAS_PASSWORD
  export UTIL_CLIENT_URI=$GCPOIDC_ATLAS_URI;
  MONGODB_URI="${GCPOIDC_ATLAS_URI}/?authMechanism=MONGODB-OIDC"
  MONGODB_URI="${MONGODB_URI}&authMechanismProperties=ENVIRONMENT:gcp"
  export MONGODB_URI="${MONGODB_URI},TOKEN_AUDIENCE:${GCPOIDC_AUDIENCE}"
  set -x
else
  if [ -z "${OIDC_TOKEN_DIR}" ]; then
    echo "Must specify OIDC_TOKEN_DIR"
    exit 1
  fi

  set +x # don't leak credentials
  export UTIL_CLIENT_USER="bob"
  export UTIL_CLIENT_PASSWORD="pwd123"
  export MONGODB_URI="${MONGODB_URI}/test?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:aws"
  set -x
fi

npm run check:oidc-auth