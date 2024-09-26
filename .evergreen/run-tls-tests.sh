#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export TLS_KEY_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/client.pem"
export TLS_CA_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem"
export TLS_CRL_FILE="$DRIVERS_TOOLS/.evergreen/x509gen/crl.pem"

npm run check:tls
