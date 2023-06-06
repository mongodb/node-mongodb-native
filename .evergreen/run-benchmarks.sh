#! /bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

export MONGODB_URI=$MONGODB_URI

npm run build:ts
npm run check:bench
