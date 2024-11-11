#! /user/bin/env bash

if [ -z ${DRIVERS_TOOLS+omitted} ]; then echo "DRIVERS_TOOLS is unset" && exit 1; fi

set -o errexit

pushd $DRIVERS_TOOLS/.evergreen/csfle
. ./activate-kmstlsvenv.sh
python bottle.py fake_azure:imds &
popd

echo "Running Azure KMS idms server on port 8080"
