#!/bin/bash

## Runs mongosh tests against the latest a particular build of the Node driver.
##
## Params:
## PROJECT_DIRECTORY - the directory containing the node driver source
## PROJECT_DIRECTORY - a unique identifier for the task (used in CI)
## MONGOSH_RUN_ONLY_IN_PACKAGE (optional) - a mongosh package name, without the `@mongosh` prefix.  if set,
## 											only the tests for the provided mognosh package are run.

set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

if [ -z ${PROJECT_DIRECTORY+omitted} ]; then echo "PROJECT_DIRECTORY is unset" && exit 1; fi
if [ -z ${TASK_ID+omitted} ]; then echo "TASK_ID is unset" && exit 1; fi

MONGOSH_RUN_ONLY_IN_PACKAGE=${MONGOSH_RUN_ONLY_IN_PACKAGE:-""}

source ./.drivers-tools/.evergreen/init-node-and-npm-env.sh

npm cache clear --force || true
npm install --global npm@8.x || true

npm pack | tee npm-pack.log

npm cache clear --force || true
npm install --global npm@8.x || true

TARBALL_FILENAME="$(tail -n1 npm-pack.log)"

MONGOSH_DIRECTORY="/tmp/$TASK_ID"
git clone --depth=10 https://github.com/mongodb-js/mongosh.git $MONGOSH_DIRECTORY

cd $MONGOSH_DIRECTORY

export DRIVER_TARBALL_PATH="${PROJECT_DIRECTORY}/${TARBALL_FILENAME}"
export MONGOSH_RUN_ONLY_IN_PACKAGE="$MONGOSH_RUN_ONLY_IN_PACKAGE"
npm run test-nodedriver
