#! /bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

export MONGODB_URI=$MONGODB_URI

npm run build:ts
npm run check:bench
