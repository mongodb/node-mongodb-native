#!/usr/bin/env bash
set -o errexit  # Exit the script with error if any of the commands fail

# allowed values:
## a nodejs major version (i.e., 16)
## 'latest'
## a full nodejs version, in the format v<major>.<minor>.patch
export NODE_LTS_VERSION=${NODE_LTS_VERSION:-16}
# npm version can be defined in the environment for cases where we need to install
# a version lower than latest to support EOL Node versions.

# If NODE_LTS_VERSION is numeric and less than 18, default to 9, if less than 20, default to 10.
# Do not override if it is already set.
if [[ "$NODE_LTS_VERSION" =~ ^[0-9]+$ && "$NODE_LTS_VERSION" -lt 18 ]]; then
    export NPM_VERSION=${NPM_VERSION:-9}
elif [[ "$NODE_LTS_VERSION" =~ ^[0-9]+$ && "$NODE_LTS_VERSION" -lt 20 ]]; then
    export NPM_VERSION=${NPM_VERSION:-10}
else
    export NPM_VERSION=${NPM_VERSION:-latest}
fi

source $DRIVERS_TOOLS/.evergreen/install-node.sh

npm install "${NPM_OPTIONS}"

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
