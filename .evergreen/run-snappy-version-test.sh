#! /usr/bin/env bash

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"
export MONGODB_URI="${MONGODB_URI}"

npm i --no-save snappy@6

npm run check:snappy

npm i --no-save snappy@7

npm run check:snappy
