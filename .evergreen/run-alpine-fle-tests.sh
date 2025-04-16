#! /usr/bin/env bash

set -o errexit
source secrets-export.sh
set -o xtrace

# use local cache - otherwise npm tries to install to ~ in the docker container, which
# fails when in a mounted volume
export npm_config_cache=$(pwd)/.cache
npm install

# Fix to point at the drivers tools pems installed in src.
export CSFLE_TLS_CA_FILE=$(pwd)/drivers-evergreen-tools/.evergreen/x509gen/ca.pem
export CSFLE_TLS_CERT_FILE=$(pwd)/drivers-evergreen-tools/.evergreen/x509gen/server.pem
export CSFLE_TLS_CLIENT_CERT_FILE=$(pwd)/drivers-evergreen-tools/.evergreen/x509gen/client.pem

ALPINE=true \
    npm run check:csfle
