#! /usr/bin/env bash

bash ${DRIVERS_TOOLS}/.evergreen/csfle/setup-secrets.sh
source secrets-export.sh

if [ -z "${RUN_WITH_MONGOCRYPTD}" ]; then
  # Set up crypt shared lib if we don't want to use mongocryptd
  bash .evergreen/prepare-crypt-shared-lib.sh
  source crypt_shared.sh
  echo "CRYPT_SHARED_LIB_PATH: $CRYPT_SHARED_LIB_PATH"
else
  echo "CRYPT_SHARED_LIB_PATH not set; using mongocryptd"
fi
