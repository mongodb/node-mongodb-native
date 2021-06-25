#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

export SSL_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
export SSL_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"

npm run check:tls
