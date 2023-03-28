#! /usr/bin/env bash

set -o errexit

if [ -z ${AZUREKMS_RESOURCEGROUP+omitted} ]; then echo "AZUREKMS_RESOURCEGROUP is unset" && exit 1; fi
if [ -z ${AZUREKMS_VMNAME+omitted} ]; then echo "AZUREKMS_VMNAME is unset" && exit 1; fi
if [ -z ${AZUREKMS_PRIVATEKEYPATH+omitted} ]; then echo "AZUREKMS_PRIVATEKEYPATH is unset" && exit 1; fi

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

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
