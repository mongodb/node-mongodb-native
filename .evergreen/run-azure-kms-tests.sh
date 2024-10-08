#! /usr/bin/env bash

set -o errexit

pushd "src"
PROJECT_DIRECTORY="$(pwd)"
export PROJECT_DIRECTORY
source "$PROJECT_DIRECTORY/.evergreen/prepare-shell.sh"

source $DRIVERS_TOOLS/.evergreen/init-node-and-npm-env.sh

set -o xtrace

export MONGODB_URI="mongodb://localhost:27017"

export EXPECTED_AZUREKMS_OUTCOME=${EXPECTED_AZUREKMS_OUTCOME:-omitted}
export TEST_CSFLE=true
export CSFLE_KMS_PROVIDERS='not json'

npx mocha --config test/mocha_mongodb.json test/integration/client-side-encryption/client_side_encryption.prose.19.on_demand_azure.test.ts
