#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

[[ -d "src/.evergreen" ]] && cd src # when on azure or gcp we are above the src directory

source ./.evergreen/prepare-shell.sh

ENVIRONMENT=${ENVIRONMENT:-"test"}
PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}

if [ -n "${K8S_VARIANT}" ]; then
  source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
fi

if [ -z "${MONGODB_URI_SINGLE}" ]; then
  echo "Must specify MONGODB_URI_SINGLE"
  exit 1
fi

if [ "$ENVIRONMENT" = "azure" ]; then
  npm run check:oidc-azure
elif [ "$ENVIRONMENT" = "gcp" ]; then
  npm run check:oidc-gcp
elif [ "$ENVIRONMENT" = "test" ]; then
  if [ -z "${OIDC_TOKEN_FILE}" ]; then
    echo "Must specify OIDC_TOKEN_FILE"
    exit 1
  fi
  npm run check:oidc-test
else
  if [ -z "${K8S_VARIANT}" ]; then
    echo "Must specify K8S_VARIANT"
    exit 1
  fi

  # Since this is running in a pod, we need to ensure Node is installed properly.
  source $DRIVERS_TOOLS/.evergreen/install-node.sh
  npm install "${NPM_OPTIONS}"
  source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

  npm run check:oidc-k8s
fi
