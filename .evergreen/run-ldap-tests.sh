#!/bin/bash

set -o errexit # Exit the script with error if any of the commands fail

bash $DRIVERS_TOOLS/.evergreen/secrets_handling/setup-secrets.sh drivers/enterprise_auth
source secrets-export.sh
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

npm run check:ldap
