#! /usr/bin/env bash

set -o errexit

export npm_config_cache=$(pwd)/.cache

npm i
source secrets-export.sh

export ALPINE=true
npm run check:csfle
