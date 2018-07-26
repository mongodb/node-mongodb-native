#!/bin/sh
# set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

NODE_LTS_NAME=${NODE_LTS_NAME:-carbon}
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
NPM_CACHE_DIR="${NODE_ARTIFACTS_PATH}/npm"
NPM_TMP_DIR="${NODE_ARTIFATS_PATH}/tmp"

# this needs to be explicitly exported for the nvm install below
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"

# create node artifacts path if needed
mkdir -p ${NODE_ARTIFACTS_PATH}
mkdir -p ${NPM_CACHE_DIR}
mkdir -p "${NPM_TMP_DIR}"

# install Node.js
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.8/install.sh | bash
[ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"
nvm install --lts=${NODE_LTS_NAME}

# setup npm cache in a local directory
cat <<EOT > .npmrc
devdir=${NPM_CACHE_DIR}/.node-gyp
init-module=${NPM_CACHE_DIR}/.npm-init.js
cache=${NPM_CACHE_DIR}
tmp=${NPM_TMP_DIR}
EOT

# install node dependencies
npm install
