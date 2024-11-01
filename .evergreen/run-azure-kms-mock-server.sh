#! /user/bin/env bash

if [ -z ${DRIVERS_TOOLS+omitted} ]; then echo "DRIVERS_TOOLS is unset" && exit 1; fi

set -o errexit

source ./activate-kms-venv.sh


echo "Python version information"
echo "which python?: ${which python}"
echo "python -v: ${python -v}"

python $DRIVERS_TOOLS/.evergreen/csfle/bottle.py fake_azure:imds &

echo "Running Azure KMS idms server on port 8080"
