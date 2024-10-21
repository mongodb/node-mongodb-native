#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
set -o xtrace

npx nyc npm run check:unit
