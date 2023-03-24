#! /user/bin/env bash

if [ -z ${DRIVERS_TOOLS+omitted} ]; then echo "DRIVERS_TOOLS is unset" && exit 1; fi

set -o errexit

python3 $DRIVERS_TOOLS/.evergreen/csfle/bottle.py fake_azure:imds &

echo "Running Azure KMS idms server on port 8080"
