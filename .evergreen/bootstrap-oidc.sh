#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate_venv.sh

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_ROLE_ARN=${AWS_ROLE_ARN}
export AWS_TOKEN_DIR=${AWS_TOKEN_DIR}

echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY
echo $AWS_ROLE_ARN
echo $AWS_TOKEN_DIR

python oidc_write_orchestration.py
python oidc_get_tokens.py
