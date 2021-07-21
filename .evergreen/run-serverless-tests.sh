#!/bin/bash
source "${PROJECT_DIRECTORY}/.evergreen/install-dependencies.sh"

SERVERLESS_ATLAS_USER="${SERVERLESS_ATLAS_USER}" \
SERVERLESS_ATLAS_PASSWORD="${SERVERLESS_ATLAS_PASSWORD}" \
SERVERLESS=1 AUTH=auth SSL=ssl \
MONGODB_URI=${MONGODB_URI} npx mocha \
  test/functional/crud_spec.test.js \
  test/functional/retryable_reads.test.js \
  test/functional/retryable_writes.test.js \
  test/functional/sessions.test.js \
  test/functional/transactions.test.js \
  test/functional/versioned-api.test.js
