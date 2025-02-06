#! /usr/bin/env bash

AUTH_AWS_DIR=${DRIVERS_TOOLS}/.evergreen/auth_aws
ECS_SRC_DIR=$AUTH_AWS_DIR/src

bash $DRIVERS_TOOLS/.evergreen/auth_aws/setup-secrets.sh

# pack up project directory to ssh it to the container
mkdir -p $ECS_SRC_DIR/.evergreen
set -ex

# write test file
cat <<EOF >$PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh
#!/bin/bash

set -o xtrace  # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

export MONGODB_URI="$1"

tar -xzf src/src.tgz
# produces src/ and drivers-tools/

cd src

source ./.evergreen/prepare-shell.sh # should not run git clone

# load node.js
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

# run the tests
npm install aws4
export MONGODB_AWS_SDK=$MONGODB_AWS_SDK
if [ $MONGODB_AWS_SDK = 'false' ]; then rm -rf ./node_modules/@aws-sdk/credential-providers; fi
npm run check:aws
EOF

# copy test file to AWS ecs test directory
cp $PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh $ECS_SRC_DIR/.evergreen/

cat $ECS_SRC_DIR/.evergreen/run-mongodb-aws-ecs-test.sh

# tar the file and drivers tools and do the same
cd ..
tar -czf src.tgz src drivers-tools
mv src.tgz $ECS_SRC_DIR/src.tgz

export MONGODB_BINARIES="${MONGODB_BINARIES}"

export PROJECT_DIRECTORY=$ECS_SRC_DIR

bash $AUTH_AWS_DIR/aws_setup.sh ecs
