#! /usr/bin/env bash

set -o errexit
source secrets-export.sh
set -o xtrace

# use local cache - otherwise npm tries to install to ~ in the docker container, which
# fails when in a mounted volume
export npm_config_cache=$(pwd)/.cache
npm install

ls -la $DRIVERS_TOOLS

ALPINE=true \
    npm run check:csfle
