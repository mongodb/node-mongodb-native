#!/bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

export SSL_KEY_FILE=$DRIVERS_TOOLS/.evergreen/x509gen/client.pem
export SSL_CA_FILE=$DRIVERS_TOOLS/.evergreen/x509gen/ca.pem
export SSL_KEY_FILE_EXPIRED=$DRIVERS_TOOLS/.evergreen/x509gen/expired.pem
export SSL_KEY_NO_USER=$DRIVERS_TOOLS/.evergreen/x509gen/crl.pem

export SUBJECT=$(openssl x509 -subject -nameopt RFC2253 -noout -inform PEM -in $SSL_KEY_FILE)

# Strip `subject=` prefix from the subject
export SUBJECT=${SUBJECT#"subject="}

# Remove any leading or trailing whitespace
export SUBJECT=$(echo "$SUBJECT" | awk '{$1=$1;print}')

npm run check:x509-auth
