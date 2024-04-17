#! /usr/bin/env bash

source "${DRIVERS_TOOLS}/.evergreen/csfle/gcpkms/secrets-export.sh"

# Assert required environment variables are present without printing them
if [ -z ${GCPKMS_GCLOUD+omitted} ]; then echo "GCPKMS_GCLOUD is unset" && exit 1; fi
if [ -z ${GCPKMS_PROJECT+omitted} ]; then echo "GCPKMS_PROJECT is unset" && exit 1; fi
if [ -z ${GCPKMS_ZONE+omitted} ]; then echo "GCPKMS_ZONE is unset" && exit 1; fi
if [ -z ${GCPKMS_INSTANCENAME+omitted} ]; then echo "GCPKMS_INSTANCENAME is unset" && exit 1; fi

set -o errexit

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

export GCPKMS_SRC=node-driver-source.tgz
export GCPKMS_DST=$GCPKMS_INSTANCENAME:

# Box up the entire driver and it's node_modules
echo "compressing node driver source ... begin"
tar -czf $GCPKMS_SRC src
echo "compressing node driver source ... end"

echo "copying node driver tar ... begin"
"${DRIVERS_TOOLS}/.evergreen/csfle/gcpkms/copy-file.sh"
echo "copying node driver tar ... end"

echo "decompressing node driver tar on gcp ... begin"
export GCPKMS_CMD="tar -xzf $GCPKMS_SRC"
"${DRIVERS_TOOLS}/.evergreen/csfle/gcpkms/run-command.sh"
echo "decompressing node driver tar on gcp ... end"
