cd ${DRIVERS_TOOLS}/.evergreen/auth_oidc
. ./activate_venv.sh
mongo setup_oidc.js
