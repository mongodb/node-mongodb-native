#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

[[ -d "src/.evergreen" ]] && cd src # when on azure or gcp we are above the src directory

source ./.evergreen/prepare-shell.sh

ENVIRONMENT=${ENVIRONMENT:-"test"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

if [ -z "${MONGODB_URI_SINGLE}" ]; then
  echo "Must specify MONGODB_URI_SINGLE"
  exit 1
fi

if [ "$ENVIRONMENT" = "test" ]; then
  if [ -z "${OIDC_TOKEN_FILE}" ]; then
    echo "Must specify OIDC_TOKEN_FILE"
    exit 1
  fi
fi

npm run check:oidc-test