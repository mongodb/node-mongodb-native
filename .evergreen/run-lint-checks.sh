#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

# Attempt to update our EVG config
# if it changes, crash so that any gen script changes are forced to be run before pushing
set +o xtrace
echo "Running evergreen config generation, expecting no changes..."
npm run build:evergreen
if ! git diff --exit-code ./.evergreen/config.yml; then
    echo "Detected .evergreen/config.yml not up to date"
    echo "Make sure to run: node .evergreen/generate_evergreen_tasks.js"
    exit 1
fi
set -o xtrace

## Checks typescript, eslint, and prettier
npm run check:lint
