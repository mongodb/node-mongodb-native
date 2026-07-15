#!/bin/bash

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

set -o errexit

# Pull the SFP connection URIs and credentials from AWS Secrets Manager (drivers/sfp).
bash ${DRIVERS_TOOLS}/.evergreen/secrets_handling/setup-secrets.sh drivers/sfp
source secrets-export.sh

# The X.509 client certificate is stored base64-encoded as SFP_ATLAS_X509_BASE64; decode it to a
# PEM file and point SFP_ATLAS_X509_CERT at that path (the tests read the path from this variable).
echo "${SFP_ATLAS_X509_BASE64}" | base64 --decode >sfp-x509-cert.pem
export SFP_ATLAS_X509_CERT="$PWD/sfp-x509-cert.pem"

export SFP_ATLAS_URI
export SFP_ATLAS_USER
export SFP_ATLAS_PASSWORD
export SFP_ATLAS_X509_URI
export SFP_ATLAS_X509_CERT

npm run check:sfp
