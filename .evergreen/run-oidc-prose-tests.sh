#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

ENVIRONMENT=${ENVIRONMENT:-"test"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

if [ -z "${MONGODB_URI_SINGLE}" ]; then
  echo "Must specify MONGODB_URI_SINGLE"
  exit 1
fi

if [ "$ENVIRONMENT" = "azure" ]; then
  npm run check:oidc-azure
elif [ "$ENVIRONMENT" = "gcp" ]; then
  npm run check:oidc-gcp
else
  if [ -z "${OIDC_TOKEN_FILE}" ]; then
    echo "Must specify OIDC_TOKEN_FILE"
    exit 1
  fi
  npm run check:oidc-test
fi
