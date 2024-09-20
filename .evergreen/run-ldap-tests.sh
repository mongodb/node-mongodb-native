#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

source ./.drivers-tools/.evergreen/init-node-and-npm-env.sh

npm run check:ldap
