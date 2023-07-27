#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"
set -o xtrace

npm i mongodb-client-encryption@alpha

npx nyc npm run check:unit
