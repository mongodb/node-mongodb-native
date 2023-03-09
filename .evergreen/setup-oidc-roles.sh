#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate-authoidcvenv.sh

${DRIVERS_TOOLS}/mongodb/bin/mongosh setup_oidc.js
