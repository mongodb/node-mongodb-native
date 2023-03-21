#!/usr/bin/env bash

source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"

if [ -z ${SERVERLESS+omitted} ]; then echo "SERVERLESS is unset" && exit 1; fi
if [ -z ${SERVERLESS_URI+omitted} ]; then echo "SERVERLESS_URI is unset" && exit 1; fi
if [ -z ${SINGLE_MONGOS_LB_URI+omitted} ]; then echo "SINGLE_MONGOS_LB_URI is unset" && exit 1; fi
if [ -z ${MULTI_MONGOS_LB_URI+omitted} ]; then echo "MULTI_MONGOS_LB_URI is unset" && exit 1; fi
if [ -z ${MONGODB_URI+omitted} ]; then echo "MONGODB_URI is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_USER+omitted} ]; then echo "SERVERLESS_ATLAS_USER is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_PASSWORD+omitted} ]; then echo "SERVERLESS_ATLAS_PASSWORD is unset" && exit 1; fi

npm install 'mongodb-client-encryption@latest'

npx mocha \
  --config test/mocha_mongodb.json \
  test/integration/crud/crud.spec.test.js \
  test/integration/crud/crud.prose.test.js \
  test/integration/retryable-reads/retryable_reads.spec.test.js \
  test/integration/retryable-writes/retryable_writes.spec.test.ts \
  test/integration/sessions/sessions.spec.test.ts \
  test/integration/sessions/sessions.prose.test.ts \
  test/integration/sessions/sessions.test.ts \
  test/integration/transactions/transactions.spec.test.js \
  test/integration/transactions/transactions.test.ts \
  test/integration/versioned-api/versioned_api.spec.test.js \
  test/integration/load-balancers/load_balancers.spec.test.js \
  test/integration/client-side-encryption/client_side_encryption.spec.test.ts
