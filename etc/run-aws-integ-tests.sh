#!/usr/bin/env bash
set -euxo pipefail # Exit on error, undefined variable, and fail on pipe errors

# NOTE: This script assumes that you've created an AWS SSO session already, as outlined in
# ../test/readme.md, section `AWS Profile`,  and you have an AWS profile
# named `drivers-test-secrets-role-857654397073` in your AWS config.

# Choose credential type: env-creds or session-creds
# export AWS_CREDENTIAL_TYPE="env-creds"
export AWS_CREDENTIAL_TYPE="session-creds"
export VERSION="latest"
export NODE_LTS_VERSION="24"
export AUTH="auth"
export ORCHESTRATION_FILE="auth-aws.json"
export TOPOLOGY="server"
export NODE_DRIVER="$DRIVERS_TOOLS/.."
export AWS_PROFILE="drivers-test-secrets-role-857654397073"

# Enable for verbose logging
# export MONGODB_LOG_ALL="debug"
# export MONGODB_LOG_PATH="stderr"

echo "Assuming AWS SSO role..."
aws sso login --sso-session drivers-test-secrets-session

echo "Installing dependencies..."
bash ${NODE_DRIVER}/.evergreen/install-dependencies.sh

echo "Bootstrapping orchestration..."
bash ${NODE_DRIVER}/.evergreen/run-orchestration.sh

echo "Running AWS integration tests with env-creds from $NODE_DRIVER ..."
bash ${NODE_DRIVER}/.evergreen/run-mongodb-aws-test.sh
