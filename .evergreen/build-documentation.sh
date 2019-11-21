#!/bin/bash
set -o xtrace   # Write all commands first to stderr
set -o errexit  # Exit the script with error if any of the commands fail

# start building docs
echo "Attempting to build documentation"

# Set environment variables
export PATH="/opt/mongodbtoolchain/v2/bin:$PATH"
NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
export NVM_DIR="${NODE_ARTIFACTS_PATH}/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# git clone git@github.com:mongodb-js/learn-mongodb-docs.git $DOCUMENTATION_BUILDER
git clone git@github.com:mongodb-js/learn-mongodb-docs.git $DOCUMENTATION_BUILDER
pushd $DOCUMENTATION_BUILDER

# Add docs directory to path
export PATH="$PATH:$(pwd)"

# Get Hugo
curl -L https://github.com/gohugoio/hugo/releases/download/v0.30.2/hugo_0.30.2_Linux-64bit.tar.gz -o hugo.tar.gz
tar xzf hugo.tar.gz

# Get jsdoc
npm install -g jsdoc@3.5

# Build docs
make 

popd