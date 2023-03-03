#! /usr/bin/env bash

export PATH="/opt/mongodbtoolchain/v2/bin:$PATH"

NODE_ARTIFACTS_PATH="${PROJECT_DIRECTORY}/node-artifacts"
if [[ "$OS" == "Windows_NT" ]]; then
  NODE_ARTIFACTS_PATH=$(cygpath --unix "$NODE_ARTIFACTS_PATH")
fi

export PATH="$NODE_ARTIFACTS_PATH/npm_global/bin:$NODE_ARTIFACTS_PATH/nodejs/bin:$PATH"
hash -r

export NODE_OPTIONS="--trace-deprecation --trace-warnings"
