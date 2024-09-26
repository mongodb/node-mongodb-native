#! /bin/bash

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

npm run check:search-indexes
