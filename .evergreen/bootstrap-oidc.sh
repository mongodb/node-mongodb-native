cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
export AWS_TOKEN_DIR=${AWS_TOKEN_DIR}
. ./activate_venv.sh
python oidc_write_orchestration.py
python oidc_get_tokens.py
