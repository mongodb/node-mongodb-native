#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

cd ${DRIVERS_TOOLS}/.evergreen/csfle
if [ "Windows_NT" = "$OS" ]; then
  PYTHON="kmstlsvenv/Scripts/python.exe"
else
  PYTHON="./kmstlsvenv/bin/python3"
fi

echo "$PYTHON"

$PYTHON -u kms_kmip_server.py \
  --ca_file ../x509gen/ca.pem \
  --cert_file ../x509gen/server.pem \
  --port 5698
