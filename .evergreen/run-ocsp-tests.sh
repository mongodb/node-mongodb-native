#!/bin/bash
set -o xtrace
set -o errexit

UNIFIED=${UNIFIED:-}

# load node.js environment
source "${PROJECT_DIRECTORY}/.evergreen/init-nvm.sh"

# $PYTHON_BINARY -m virtualenv --never-download --no-wheel ocsptest
#     . ocsptest/bin/activate
#     trap "deactivate; rm -rf ocsptest" EXIT HUP
#     pip install pyopenssl requests service_identity
#     PYTHON=python

# NOTE: `--opts {}` is used below to revert mocha to normal behavior (without mongodb specific plugins)
MONGODB_UNIFIED_TOPOLOGY=${UNIFIED} \
OCSP_TLS_SHOULD_SUCCEED=${OCSP_TLS_SHOULD_SUCCEED} \
CA_FILE=${CA_FILE} \
npm run check:ocsp
