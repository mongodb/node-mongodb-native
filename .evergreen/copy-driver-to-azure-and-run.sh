#! /usr/bin/env bash

set -o errexit
source "${DRIVERS_TOOLS}/.evergreen/csfle/azurekms/secrets-export.sh"

if [ -z ${AZUREKMS_RESOURCEGROUP+omitted} ]; then echo "AZUREKMS_RESOURCEGROUP is unset" && exit 1; fi
if [ -z ${AZUREKMS_VMNAME+omitted} ]; then echo "AZUREKMS_VMNAME is unset" && exit 1; fi

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export AZUREKMS_PUBLICKEYPATH=/tmp/testazurekms_publickey
export AZUREKMS_PRIVATEKEYPATH=/tmp/testazurekms_privatekey

echo "compressing node driver source ... begin"
tar -czf node-driver-source.tgz src
echo "compressing node driver source ... end"

export AZUREKMS_SRC=node-driver-source.tgz
export AZUREKMS_DST="./"
echo "copying node driver tar ... begin"
"${DRIVERS_TOOLS}/.evergreen/csfle/azurekms/copy-file.sh"
echo "copying node driver tar ... end"

echo "decompressing node driver tar on azure ... begin"
export AZUREKMS_CMD="tar xf node-driver-source.tgz"
"${DRIVERS_TOOLS}/.evergreen/csfle/azurekms/run-command.sh"
echo "decompressing node driver tar on azure ... end"

echo "Running test ... begin"
export AZUREKMS_CMD="env EXPECTED_AZUREKMS_OUTCOME=success bash src/.evergreen/run-azure-kms-tests.sh"
${DRIVERS_TOOLS}/.evergreen/csfle/azurekms/run-command.sh
echo "Running test ... end"
