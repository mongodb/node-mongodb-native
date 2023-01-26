#! /bin/bash

if [ -z ${TASK_ID+omitted} ]; then echo "TASK_ID is unset" && exit 1; fi

source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

MONGOSH_DIRECTORY="/tmp/$TASK_ID"
git clone --depth=10 -b misc-changes-for-node-driver-ci https://github.com/baileympearson/mongosh.git $MONGOSH_DIRECTORY

cd $MONGOSH_DIRECTORY
npm i lerna
export SCOPES=$(./node_modules/lerna/cli.js ls --scope @mongosh/service-provider-server --scope @mongosh/connectivity-tests --include-dependents)

cd -

npx mocha --config test/manual/mocharc.json test/manual/mongosh_scopes.test.ts
