#! /bin/bash

if [ -z ${TASK_ID+omitted} ]; then echo "TASK_ID is unset" && exit 1; fi

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

MONGOSH_DIRECTORY="/tmp/$TASK_ID"
git clone --depth=10 https://github.com/mongodb-js/mongosh.git $MONGOSH_DIRECTORY

cd $MONGOSH_DIRECTORY
npm i lerna
export SCOPES=$(./node_modules/lerna/cli.js ls --all --json)

cd -

npx mocha --config test/manual/mocharc.json test/manual/mongosh_scopes.test.ts
