#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}
export AWS_TOKEN_DIR=${AWS_TOKEN_DIR}

echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
echo $AWS_SESSION_TOKEN
echo $AWS_TOKEN_DIR

. ./activate_venv.sh
python oidc_write_orchestration.py
python oidc_get_tokens.py
