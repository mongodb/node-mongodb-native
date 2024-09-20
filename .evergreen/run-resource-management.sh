#! /bin/bash

source ./.drivers-tools/.evergreen/init-node-and-npm-env.sh

npm run check:resource-management
