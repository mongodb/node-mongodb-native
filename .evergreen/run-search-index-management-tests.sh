#! /bin/bash

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

npm run check:search-indexes
