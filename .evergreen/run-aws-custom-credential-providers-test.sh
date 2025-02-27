#!/bin/bash
# set -o xtrace   # Write all commands first to stderr
set -o errexit # Exit the script with error if any of the commands fail

MONGODB_URI=${MONGODB_URI:-}

# . $DRIVERS_TOOLS/.evergreen/secrets_handling/setup-secrets.sh drivers/aws_auth

export
source .evergreen/setup-fle.sh

#export
#source .evergreen/setup-mongodb-aws-auth-tests.sh

# load node.js environment
source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

export TEST_CSFLE=true

npx mocha --config test/mocha_mongodb.js test/integration/client-side-encryption/client_side_encryption.prose.25.custom_aws_credential_providers.test.ts