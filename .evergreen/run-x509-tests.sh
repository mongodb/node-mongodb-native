#!/bin/bash

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

set -o errexit

bash drivers-evergreen-tools/.evergreen/secrets_handling/setup-secrets.sh drivers/atlas_connect
source secrets-export.sh

echo "${ATLAS_X509_DEV_CERT_BASE64}" | base64 --decode >clientcert.pem
echo "${ATLAS_X509_DEV_CERT_NOUSER_BASE64}" | base64 --decode >nouser.pem

SSL_KEY_FILE_EXPIRED=$DRIVERS_TOOLS/.evergreen/x509gen/expired.pem
MONGODB_URI="$ATLAS_X509_DEV"

export MONGODB_URI
export SSL_KEY_FILE_EXPIRED
export SSL_KEY_FILE_NO_USER="nouser.pem"
export SSL_KEY_FILE="clientcert.pem"

npm run check:x509
