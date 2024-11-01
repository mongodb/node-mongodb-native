#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

pushd ${DRIVERS_TOOLS}/.evergreen/csfle
. ./activate-kmstlsvenv.sh

popd
