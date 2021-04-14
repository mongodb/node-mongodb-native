#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

export PROJECT_DIRECTORY="$(pwd)"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

npm run check:lint
