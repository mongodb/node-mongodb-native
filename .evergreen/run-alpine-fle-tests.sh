#! /usr/bin/env bash

set -o errexit

export npm_cache_dir=$(pwd)

npm i
source secrets-export.sh

export ALPINE=true
npm run check:csfle
