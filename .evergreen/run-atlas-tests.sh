#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

set -o xtrace

node -v

npm run check:atlas
