#!/usr/bin/env bash
set -o errexit  # Exit the script with error if any of the commands fail

# allowed values:
## a nodejs major version (i.e., 16)
## 'latest'
## a full nodejs version, in the format v<major>.<minor>.patch
export NODE_LTS_VERSION=${NODE_LTS_VERSION:-16}
# Use the npm bundled with the installed Node.js release instead of upgrading to
# npm@latest. The bundled npm is version-matched to the Node release and avoids
# pulling an npm@latest that no longer supports our (often pinned) Node version.
export SKIP_NPM_UPGRADE=true
source $DRIVERS_TOOLS/.evergreen/install-node.sh

if [ "$NATIVE" = "true" ]; then
  # https://github.com/nodejs/node-gyp#configuring-python-dependency
  . $DRIVERS_TOOLS/.evergreen/find-python3.sh
  NODE_GYP_FORCE_PYTHON=$(find_python3)
  export NODE_GYP_FORCE_PYTHON
fi

npm install "${NPM_OPTIONS}"

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
