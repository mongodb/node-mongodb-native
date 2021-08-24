#! /usr/bin/env bash

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"
export MONGODB_URI="${MONGODB_URI}"

npm i --no-save snappy@6

npx mocha test/unit/snappy.test.js

npm i --no-save snappy@7

npx mocha test/unit/snappy.test.js
