#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

# TODO(BUILD-16902): Install SAM on Evergreen boxes.
curl -L https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip -o aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install
sam --version

. ${DRIVERS_TOOLS}/.evergreen/run-deployed-lambda-aws-tests.sh
