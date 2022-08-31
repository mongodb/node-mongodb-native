#! /bin/bash

[ -s "$PROJECT_DIRECTORY/node-artifacts/nvm/nvm.sh" ] && source "$PROJECT_DIRECTORY"/node-artifacts/nvm/nvm.sh

export MONGODB_URI=$MONGODB_URI

npm run build:ts
npm run check:bench
