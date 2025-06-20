#! /usr/bin/env bash

AUTH_AWS_DIR=${DRIVERS_TOOLS}/.evergreen/auth_aws
ECS_SRC_DIR=$AUTH_AWS_DIR/src

bash $DRIVERS_TOOLS/.evergreen/auth_aws/setup-secrets.sh

# pack up project directory to ssh it to the container
mkdir -p $ECS_SRC_DIR/.evergreen
set -ex

# write test file
echo "export MONGODB_AWS_SDK=$MONGODB_AWS_SDK" >>$PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh
echo "if [ $MONGODB_AWS_SDK = 'false' ]; then rm -rf ./node_modules/@aws-sdk/credential-providers; fi" >>$PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh
echo "npm run check:aws" >>$PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh

# copy test file to AWS ecs test directory
cp $PROJECT_DIRECTORY/.evergreen/run-mongodb-aws-ecs-test.sh $ECS_SRC_DIR/.evergreen/

cat $ECS_SRC_DIR/.evergreen/run-mongodb-aws-ecs-test.sh

# tar the file and drivers tools and do the same
cd ..
tar -czf src.tgz src
mv src.tgz $ECS_SRC_DIR/src.tgz

export MONGODB_BINARIES="${MONGODB_BINARIES}"

export PROJECT_DIRECTORY=$ECS_SRC_DIR

bash $AUTH_AWS_DIR/aws_setup.sh ecs
