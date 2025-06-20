#!/usr/bin/env bash
set -o errexit  # Exit the script with error if any of the commands fail

# allowed values:
## a nodejs major version (i.e., 16)
## 'latest'
## a full nodejs version, in the format v<major>.<minor>.patch
export NODE_LTS_VERSION=${NODE_LTS_VERSION:-16}
# npm version can be defined in the environment for cases where we need to install
# a version lower than latest to support EOL Node versions. When not provided will
# be handled by this script in drivers tools.
source $DRIVERS_TOOLS/.evergreen/install-node.sh

if [ "$NATIVE" = "true" ]; then
  # https://github.com/nodejs/node-gyp#configuring-python-dependency
  . $DRIVERS_TOOLS/.evergreen/find-python3.sh
  NODE_GYP_FORCE_PYTHON=$(find_python3)
  export NODE_GYP_FORCE_PYTHON
fi

npm install "${NPM_OPTIONS}"

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
