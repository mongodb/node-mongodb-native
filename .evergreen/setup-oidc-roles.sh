#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate-authoidcvenv.sh

${DRIVERS_TOOLS}/mongodb/bin/mongosh "mongodb://localhost:27017,localhost:27018/?replicaSet=oidc-repl0&readPreference=primary" setup_oidc.js
