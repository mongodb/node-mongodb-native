#! /usr/bin/env bash

bash ${DRIVERS_TOOLS}/.evergreen/csfle/setup-secrets.sh
source secrets-export.sh

# start KMS servers
bash ${DRIVERS_TOOLS}/.evergreen/csfle/start-servers.sh

if [ -z "${RUN_WITH_MONGOCRYPTD}" ]; then
    echo "crypt shared: $CRYPT_SHARED_LIB_PATH"
else
    rm $CRYPT_SHARED_LIB_PATH
    unset CRYPT_SHARED_LIB_PATH
    echo "CRYPT_SHARED_LIB_PATH not set; using mongocryptd"
fi
