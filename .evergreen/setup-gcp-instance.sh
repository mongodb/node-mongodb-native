#! /usr/bin/env bash

set -o errexit
if [ -z ${testgcpkms_key_file+omitted} ]; then echo "testgcpkms_key_file is unset" && exit 1; fi

echo "${testgcpkms_key_file}" > ./testgcpkms_key_file.json
export GCPKMS_KEYFILE=./testgcpkms_key_file.json

"$GCPKMS_DRIVERS_TOOLS/.evergreen/csfle/gcpkms/create-and-setup-instance.sh"
