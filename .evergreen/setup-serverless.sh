#!/usr/bin/env bash

bash ${DRIVERS_TOOLS}/.evergreen/secrets_handling/setup-secrets.sh drivers/serverless
bash ${DRIVERS_TOOLS}/.evergreen/serverless/create-instance.sh

cp ${DRIVERS_TOOLS}/.evergreen/serverless/secrets-export.sh .

# generate a source-able expansion file
cat serverless-expansion.yml | sed 's/: /=/g' > serverless.env

echo 'export MONGODB_URI="${SERVERLESS_URI}"' >> serverless.env
echo 'export SINGLE_MONGOS_LB_URI="${SERVERLESS_URI}"' >> serverless.env
echo 'export MULTI_MONGOS_LB_URI="${SERVERLESS_URI}"' >> serverless.env
echo 'export SERVERLESS=1' >> serverless.env
