#!/usr/bin/env bash

cd $DRIVERS_TOOLS/.evergreen/auth_aws

. ./activate-authawsvenv.sh

# Test with permanent credentials
. aws_setup.sh env-creds
unset MONGODB_URI
echo "AWS_SESSION_TOKEN is set to '${AWS_SESSION_TOKEN-NOT SET}'"
npm run check:test -- --grep "AwsSigV4"

# Test with session credentials
. aws_setup.sh session-creds
unset MONGODB_URI
echo "AWS_SESSION_TOKEN is set to '${AWS_SESSION_TOKEN-NOT SET}'"
npm run check:test -- --grep "AwsSigV4"
