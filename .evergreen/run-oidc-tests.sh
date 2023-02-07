#!/bin/bash

set -o errexit  # Exit the script with error if any of the commands fail

mongo $DRIVERS_TOOLS/.evergreen/auth_oidc/setup_oidc.js

npm run check:oidc
