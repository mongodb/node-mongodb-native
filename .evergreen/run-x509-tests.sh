#!/bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

set -o errexit

export SSL_KEY_FILE=$DRIVERS_TOOLS/.evergreen/x509gen/client.pem
export SSL_CA_FILE=$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem
export SSL_KEY_FILE_EXPIRED=$DRIVERS_TOOLS/.evergreen/x509gen/expired.pem
export SSL_KEY_NO_USER=$DRIVERS_TOOLS/.evergreen/x509gen/crl.pem

SUBJECT=$(openssl x509 -subject -nameopt RFC2253 -noout -inform PEM -in $SSL_KEY_FILE)

# Strip `subject=` prefix from the subject
SUBJECT=${SUBJECT#"subject="}

# Remove any leading or trailing whitespace
SUBJECT=$(echo "$SUBJECT" | awk '{$1=$1;print}')

export SUBJECT

npm run check:x509
