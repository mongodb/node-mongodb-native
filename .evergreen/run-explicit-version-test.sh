#!/bin/bash
set -o errexit

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

cd "${PROJECT_DIRECTORY}/test/explicit-version-test"
DRIVER_VERSION="${DRIVER_VERSION:-latest}"

echo "=== Installing mongodb@${DRIVER_VERSION} ==="
npm install --no-save "mongodb@${DRIVER_VERSION}"

echo "=== Running explicit version test ==="
node index.mjs
