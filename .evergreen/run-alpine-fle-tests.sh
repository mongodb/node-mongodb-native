#! /usr/bin/env bash

set -o errexit
source secrets-export.sh
set -o xtrace

export npm_config_cache=$(pwd)/.cache

npm i

npm ls

node --print "require('mongodb-client-encryption')"

export ALPINE=true
npm run check:csfle
