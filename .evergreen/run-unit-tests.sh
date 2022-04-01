#!/bin/bash
set -o errexit # Exit the script with error if any of the commands fail
set -o xtrace

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

npx nyc npm run check:unit
