#! /bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-node-and-npm-env.sh"

npm run check:resource-management
