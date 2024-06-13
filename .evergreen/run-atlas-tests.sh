#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

if test -f secrets-export.sh; then
  source secrets-export.sh
fi

PROJECT_DIRECTORY=${PROJECT_DIRECTORY:-"."}
source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

node -v

npm run check:atlas
