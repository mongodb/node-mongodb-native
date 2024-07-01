#! /usr/bin/env bash
set +o xtrace # Do not write AWS credentials to stderr

# Initiail checks for running these tests
if [ -z ${AWS_ACCESS_KEY_ID+omitted} ]; then echo "AWS_ACCESS_KEY_ID is unset" && exit 1; fi
if [ -z ${AWS_SECRET_ACCESS_KEY+omitted} ]; then echo "AWS_SECRET_ACCESS_KEY is unset" && exit 1; fi
if [ -z ${CSFLE_KMS_PROVIDERS+omitted} ]; then echo "CSFLE_KMS_PROVIDERS is unset" && exit 1; fi

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export CSFLE_KMS_PROVIDERS=${CSFLE_KMS_PROVIDERS}
export CRYPT_SHARED_LIB_PATH=${CRYPT_SHARED_LIB_PATH}
echo "csfle CRYPT_SHARED_LIB_PATH: $CRYPT_SHARED_LIB_PATH"

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# Get access to the AWS temporary credentials:
echo "adding temporary AWS credentials to environment"
# CSFLE_AWS_TEMP_ACCESS_KEY_ID, CSFLE_AWS_TEMP_SECRET_ACCESS_KEY, CSFLE_AWS_TEMP_SESSION_TOKEN
. "$DRIVERS_TOOLS"/.evergreen/csfle/set-temp-creds.sh

export MONGODB_URI=${MONGODB_URI}
export KMIP_TLS_CA_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/ca.pem"
export KMIP_TLS_CERT_FILE="${DRIVERS_TOOLS}/.evergreen/x509gen/client.pem"
export TEST_CSFLE=true

npm run check:csfle
