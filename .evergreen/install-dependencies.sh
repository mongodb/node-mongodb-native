#!/usr/bin/env bash
set -o errexit  # Exit the script with error if any of the commands fail

# allowed values:
## a nodejs major version (i.e., 16)
## 'latest'
## a full nodejs version, in the format v<major>.<minor>.patch
if [ -z ${NODE_LTS_VERSION+omitted} ]; then echo "NODE_LTS_VERSION is unset" && exit 1; fi

# npm version can be defined in the environment for cases where we need to install
# a version lower than latest to support EOL Node versions. When not provided will
# be handled by this script in drivers tools.
source $DRIVERS_TOOLS/.evergreen/install-node.sh

# On Windows, install-node.sh resolves SCRIPT_DIR via realpath which may follow an NTFS
# junction (e.g. C: -> Z:), so NODE_ARTIFACTS_PATH is now correctly set to the real drive.
# Persist it to .env so that subsequent shells (e.g. run-tests.sh) can recover it even
# when they call init-node-and-npm-env.sh via the C: DRIVERS_TOOLS path.
if [ "${OS:-}" = "Windows_NT" ] && [ -n "${NODE_ARTIFACTS_PATH:-}" ]; then
  echo "NODE_ARTIFACTS_PATH=${NODE_ARTIFACTS_PATH}" >> "${DRIVERS_TOOLS}/.env"
fi
_INSTALL_DEPS_NODE_ARTIFACTS_PATH="${NODE_ARTIFACTS_PATH:-}"

if [ "$NATIVE" = "true" ]; then
  # https://github.com/nodejs/node-gyp#configuring-python-dependency
  . $DRIVERS_TOOLS/.evergreen/find-python3.sh
  NODE_GYP_FORCE_PYTHON=$(find_python3)
  export NODE_GYP_FORCE_PYTHON
fi

npm install "${NPM_OPTIONS}"

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh
# On Windows, the init call above may have overwritten NODE_ARTIFACTS_PATH with the wrong
# drive letter.  Restore the previously resolved path if npm is no longer accessible.
if [ "${OS:-}" = "Windows_NT" ] && [ -n "$_INSTALL_DEPS_NODE_ARTIFACTS_PATH" ] && ! command -v npm >/dev/null 2>&1; then
  export NODE_ARTIFACTS_PATH="$_INSTALL_DEPS_NODE_ARTIFACTS_PATH"
  export PATH="$NODE_ARTIFACTS_PATH/nodejs/bin:$PATH"
  hash -r
fi
