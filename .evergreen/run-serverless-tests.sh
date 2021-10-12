#!/usr/bin/env bash

source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"

if [ -z ${SERVERLESS+omitted} ]; then echo "SERVERLESS is unset" && exit 1; fi
if [ -z ${MULTI_ATLASPROXY_SERVERLESS_URI+omitted} ]; then echo "MULTI_ATLASPROXY_SERVERLESS_URI is unset" && exit 1; fi
if [ -z ${SINGLE_ATLASPROXY_SERVERLESS_URI+omitted} ]; then echo "SINGLE_ATLASPROXY_SERVERLESS_URI is unset" && exit 1; fi
if [ -z ${SINGLE_MONGOS_LB_URI+omitted} ]; then echo "SINGLE_MONGOS_LB_URI is unset" && exit 1; fi
if [ -z ${MULTI_MONGOS_LB_URI+omitted} ]; then echo "MULTI_MONGOS_LB_URI is unset" && exit 1; fi
if [ -z ${MONGODB_URI+omitted} ]; then echo "MONGODB_URI is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_USER+omitted} ]; then echo "SERVERLESS_ATLAS_USER is unset" && exit 1; fi
if [ -z ${SERVERLESS_ATLAS_PASSWORD+omitted} ]; then echo "SERVERLESS_ATLAS_PASSWORD is unset" && exit 1; fi

npx mocha --file test/tools/runner/index.js \
  test/functional/crud_spec.test.js \
  test/functional/retryable_reads.test.js \
  test/functional/retryable_writes.test.js \
  test/functional/sessions.test.js \
  test/functional/transactions.test.js \
  test/functional/versioned-api.test.js \
  test/functional/load-balancer-spec.test.js
