#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

source ./activate-kms-venv.sh


echo "Python version information"
echo "which python?: ${which python}"
echo "python -v: ${python -v}"

python -u kms_kmip_server.py \
  --ca_file ../x509gen/ca.pem \
  --cert_file ../x509gen/server.pem \
  --port 5698
