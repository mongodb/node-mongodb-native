#!/usr/bin/env bash

source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"

if [ -z ${SERVERLESS+omitted} ]; then echo "SERVERLESS is unset" && exit 1; fi
if [ -z ${MULTI_ATLASPROXY_SERVERLESS_URI+omitted} ]; then echo "MULTI_ATLASPROXY_SERVERLESS_URI is unset" && exit 1; fi
if [ -z ${SINGLE_ATLASPROXY_SERVERLESS_URI+omitted} ]; then echo "SINGLE_ATLASPROXY_SERVERLESS_URI is unset" && exit 1; fi
# if [ -z ${SINGLE_MONGOS_LB_URI+omitted} ]; then echo "SINGLE_MONGOS_LB_URI is unset" && exit 1; fi
# if [ -z ${MULTI_MONGOS_LB_URI+omitted} ]; then echo "MULTI_MONGOS_LB_URI is unset" && exit 1; fi
if [ -z ${MONGODB_URI+omitted} ]; then echo "MONGODB_URI is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_USER+omitted} ]; then echo "SERVERLESS_ATLAS_USER is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_PASSWORD+omitted} ]; then echo "SERVERLESS_ATLAS_PASSWORD is unset" && exit 1; fi

npx mocha --file test/tools/runner/index.js \
  test/integration/crud/crud.spec.test.js \
  test/integration/retryable-reads/retryable_reads.spec.test.js \
  test/integration/retryable-writes/retryable_writes.spec.test.js \
  test/functional/sessions.test.js \
  test/functional/transactions.test.js \
  test/integration/versioned-api/versioned_api.spec.test.js \
  test/integration/load-balancers/load_balancers.spec.test.js
