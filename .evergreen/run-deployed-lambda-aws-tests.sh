#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

# export DRIVERS_ATLAS_PUBLIC_API_KEY=${DRIVERS_ATLAS_PUBLIC_API_KEY}
# export DRIVERS_ATLAS_PRIVATE_API_KEY=${DRIVERS_ATLAS_PRIVATE_API_KEY}
# export DRIVERS_ATLAS_LAMBDA_USER=${DRIVERS_ATLAS_LAMBDA_USER}
# export DRIVERS_ATLAS_LAMBDA_PASSWORD=${DRIVERS_ATLAS_LAMBDA_PASSWORD}
# export DRIVERS_ATLAS_GROUP_ID=${DRIVERS_ATLAS_GROUP_ID}
# export TEST_LAMBDA_DIRECTORY=${TEST_LAMBDA_DIRECTORY}
# export LAMBDA_STACK_NAME=${LAMBDA_STACK_NAME}
# export AWS_REGION=${AWS_REGION}

# TODO(BUILD-16797): Install sam on EVG
curl -L https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip -o aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install
sam --version

. ${DRIVERS_TOOLS}/.evergreen/run-deployed-lambda-aws-tests.sh
