#! /bin/bash

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export MONGODB_URI=$MONGODB_URI

npm run build:ts
npm run check:bench
